import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { setListingsPaused } from "./listing-actions.ts";
import { createListingWithTargets, markTargetPublished } from "./listings.ts";
import { stopProductPublications } from "./stop-product-publications.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantId = "";
let storeId = "";
let otherStoreId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  tenantId = tenants.tenantA;
  storeId = (
    await upsertStoreConnection(database, testStoreInput(tenantId, `shop-why-${tenantId}`))
  ).id;
  otherStoreId = (
    await upsertStoreConnection(database, testStoreInput(tenantId, `shop-why-2-${tenantId}`))
  ).id;
  catalog = await createTestSupplierProduct(database, {
    sku: "WHY-1",
    title: "Produto motivo",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

async function listing(status: "published" | "pending", store = storeId) {
  const created = await createListingWithTargets(
    database,
    tenantId,
    {
      supplierProductId: catalog.productId,
      title: "Motivo",
      description: "",
      priceCents: 2790,
    },
    [store],
  );
  const targetId = created.targetIds[0] ?? "";
  await database
    .update(listingTargets)
    .set({ status, externalId: status === "published" ? `MOCK-${targetId}` : null })
    .where(eq(listingTargets.id, targetId));
  return { listingId: created.listingId, targetId };
}

async function stateOf(targetId: string) {
  const [row] = await database
    .select({ status: listingTargets.status, pauseReason: listingTargets.pauseReason })
    .from(listingTargets)
    .where(eq(listingTargets.id, targetId));
  return row;
}

async function removeListing(targetId: string) {
  await database.delete(listingTargets).where(eq(listingTargets.id, targetId));
}

describe("the reason a publication is paused", () => {
  it("records the reseller's own pause and clears it on resume", async () => {
    const { listingId, targetId } = await listing("published");

    await setListingsPaused(database, tenantId, [listingId], true);
    const paused = await stateOf(targetId);
    await setListingsPaused(database, tenantId, [listingId], false);
    const resumed = await stateOf(targetId);

    expect(paused).toEqual({ status: "paused", pauseReason: "seller" });
    expect(resumed).toEqual({ status: "published", pauseReason: null });
    await removeListing(targetId);
  });

  it("records an archived product, also for a publication still on its way", async () => {
    const live = await listing("published");
    const queued = await listing("pending", otherStoreId);

    await stopProductPublications(database, tenantId, catalog.productId);
    await markTargetPublished(database, queued.targetId, {
      externalId: "MOCK-LATE",
      externalUrl: null,
    });

    expect(await stateOf(live.targetId)).toEqual({
      status: "paused",
      pauseReason: "product_archived",
    });
    expect(await stateOf(queued.targetId)).toEqual({
      status: "paused",
      pauseReason: "product_archived",
    });
    await removeListing(live.targetId);
    await removeListing(queued.targetId);
  });
});
