import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  findTargetsWithPendingDescription,
  markDescriptionFailed,
  markDescriptionSent,
  requestDescriptionResend,
} from "./listing-descriptions.ts";
import { createListingWithTargets, markTargetPublished } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let listingId = "";
let targetId = "";

async function targetRow() {
  const row = await database.query.listingTargets.findFirst({
    where: eq(listingTargets.id, targetId),
  });
  if (!row) throw new Error("alvo não encontrado");
  return row;
}

async function pendingIds(): Promise<string[]> {
  return (await findTargetsWithPendingDescription(database, 500)).map((row) => row.targetId);
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  catalog = await createTestSupplierProduct(database, {
    sku: "DESC-1",
    title: "Produto descrição",
    costCents: 1000,
    suggestedPriceCents: 3000,
  });
  const store = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantA, `desc-${tenants.tenantA}`),
  );
  const created = await createListingWithTargets(
    database,
    tenants.tenantA,
    {
      supplierProductId: catalog.productId,
      title: "Anúncio descrição",
      description: "Descrição que o marketplace recusou",
      priceCents: 3000,
    },
    [store.id],
  );
  listingId = created.listingId;
  targetId = created.targetIds[0] ?? "";
  await markTargetPublished(database, targetId, {
    externalId: "MOCK-DESC-1",
    externalUrl: null,
    descriptionError: "A descrição tem caracteres que o Mercado Livre não aceita.",
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("listing descriptions the marketplace refused", () => {
  it("keeps the listing published and remembers why its description failed", async () => {
    expect(await targetRow()).toMatchObject({
      status: "published",
      descriptionError: "A descrição tem caracteres que o Mercado Livre não aceita.",
      descriptionAttempts: 0,
    });
    expect((await targetRow()).descriptionFailedAt).not.toBeNull();
    const [pending] = (await findTargetsWithPendingDescription(database, 500)).filter(
      (row) => row.targetId === targetId,
    );
    expect(pending).toMatchObject({
      externalId: "MOCK-DESC-1",
      plainText: "Descrição que o marketplace recusou",
    });
  });

  it("stops retrying on its own after three failed attempts", async () => {
    for (const attempt of [1, 2, 3]) {
      expect(await pendingIds()).toContain(targetId);
      await markDescriptionFailed(database, targetId, `Falha ${attempt}`);
    }
    expect(await targetRow()).toMatchObject({
      descriptionAttempts: 3,
      descriptionError: "Falha 3",
    });
    expect(await pendingIds()).not.toContain(targetId);
  });

  it("lets only the owner ask for a resend, which restarts the attempts", async () => {
    expect(await requestDescriptionResend(database, tenants.tenantB, [listingId])).toBe(0);
    expect(await pendingIds()).not.toContain(targetId);
    expect(await requestDescriptionResend(database, tenants.tenantA, [listingId])).toBe(1);
    expect(await targetRow()).toMatchObject({
      descriptionAttempts: 0,
      descriptionError: "Falha 3",
    });
    expect(await pendingIds()).toContain(targetId);
  });

  it("clears the failure once the description goes through", async () => {
    await markDescriptionSent(database, targetId);
    expect(await targetRow()).toMatchObject({
      descriptionError: null,
      descriptionFailedAt: null,
      descriptionAttempts: 0,
    });
    expect(await pendingIds()).not.toContain(targetId);
  });
});
