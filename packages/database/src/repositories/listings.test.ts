import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiEvents, listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  createListingWithTargets,
  listListingTargets,
  markTargetFailed,
  markTargetPublished,
} from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let productId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `shop-a-${tenantA}`))).id;
  catalog = await createTestSupplierProduct(database, {
    sku: "ISO-1",
    title: "Produto isolamento",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  productId = catalog.productId;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("listings are tenant-scoped", () => {
  it("lists only the tenant's publications and reports active ones", async () => {
    await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio do tenant A",
        description: "Descrição",
        priceCents: 2500,
      },
      [storeA],
    );
    const ofA = await listListingTargets(database, tenantA, {}, { page: 1, pageSize: 10 });
    const ofB = await listListingTargets(database, tenantB, {}, { page: 1, pageSize: 10 });
    expect(ofA.items.map((item) => item.title)).toContain("Anúncio do tenant A");
    expect(ofA.hasActive).toBe(true);
    expect(ofB.items).toEqual([]);
    expect(ofB.hasActive).toBe(false);
  });

  it("requires at least one destination store", async () => {
    await expect(
      createListingWithTargets(
        database,
        tenantA,
        {
          supplierProductId: productId,
          title: "Sem lojas",
          description: "Descrição",
          priceCents: 2500,
        },
        [],
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

async function eventsOfTarget(listingTargetId: string) {
  return database
    .select({ type: apiEvents.type, data: apiEvents.data })
    .from(apiEvents)
    .where(
      and(
        eq(apiEvents.tenantId, tenantA),
        sql`${apiEvents.data} ->> 'listingTargetId' = ${listingTargetId}`,
      ),
    )
    .orderBy(apiEvents.sequence);
}

async function createTarget(title: string) {
  const created = await createListingWithTargets(
    database,
    tenantA,
    { supplierProductId: productId, title, description: "Descrição", priceCents: 2500 },
    [storeA],
  );
  const [targetId] = created.targetIds;
  if (!targetId) {
    throw new Error("destino");
  }
  return { listingId: created.listingId, targetId };
}

async function targetState(listingTargetId: string) {
  const [row] = await database
    .select({
      status: listingTargets.status,
      externalId: listingTargets.externalId,
      errorReason: listingTargets.errorReason,
    })
    .from(listingTargets)
    .where(eq(listingTargets.id, listingTargetId));
  return row;
}

describe("listing events", () => {
  it("records listing.published with the store and the public url", async () => {
    const { listingId, targetId } = await createTarget("Anúncio publicado");
    await markTargetPublished(database, targetId, {
      externalId: "EXT-EV",
      externalUrl: "https://loja.example/EXT-EV",
    });
    expect(await eventsOfTarget(targetId)).toEqual([
      {
        type: "listing.published",
        data: {
          listingId,
          listingTargetId: targetId,
          storeId: storeA,
          status: "published",
          externalUrl: "https://loja.example/EXT-EV",
          errorReason: null,
        },
      },
    ]);
  });

  it("records listing.failed only on the final failure", async () => {
    const { targetId } = await createTarget("Anúncio recusado");
    await markTargetFailed(database, targetId, "Instável", { final: false });
    expect(await eventsOfTarget(targetId)).toEqual([]);

    await markTargetFailed(database, targetId, "Categoria inválida", { final: true });
    const events = await eventsOfTarget(targetId);
    expect(events.map((event) => event.type)).toEqual(["listing.failed"]);
    expect(events[0]?.data).toMatchObject({ status: "error", errorReason: "Categoria inválida" });
  });

  it("ignores a late failure once the target is published", async () => {
    const { targetId } = await createTarget("Anúncio publicado antes da falha");
    await markTargetPublished(database, targetId, { externalId: "EXT-OK", externalUrl: null });
    await markTargetFailed(database, targetId, "Tempo esgotado", { final: true });

    expect(await targetState(targetId)).toEqual({
      status: "published",
      externalId: "EXT-OK",
      errorReason: null,
    });
    expect((await eventsOfTarget(targetId)).map((event) => event.type)).toEqual([
      "listing.published",
    ]);
  });

  it("does not let a second publish result replace the saved listing", async () => {
    const { targetId } = await createTarget("Anúncio publicado duas vezes");
    await markTargetPublished(database, targetId, { externalId: "EXT-FIRST", externalUrl: null });

    await expect(
      markTargetPublished(database, targetId, { externalId: "EXT-LATE", externalUrl: null }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await targetState(targetId)).toMatchObject({ externalId: "EXT-FIRST" });
  });

  it("saves a late success over the stalled sweeper's error", async () => {
    const { targetId } = await createTarget("Anúncio criado depois do timeout");
    await markTargetFailed(database, targetId, "Interrompida", { final: true });
    await markTargetPublished(database, targetId, { externalId: "EXT-LATE", externalUrl: null });

    expect(await targetState(targetId)).toEqual({
      status: "published",
      externalId: "EXT-LATE",
      errorReason: null,
    });
  });
});
