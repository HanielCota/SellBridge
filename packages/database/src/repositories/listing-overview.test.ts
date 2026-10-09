import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listingTargets,
  orderItems,
  orders,
  supplierProducts,
  suppliers,
} from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import {
  listListingOverview,
  resetListingErrorsForRetry,
  setListingsPaused,
  updateListingPrice,
} from "./listing-overview.ts";
import { createListingWithTargets, findTargetsNeedingSync, markTargetFailed } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const page = { page: 1, pageSize: 20 };
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let tenantB = "";
let storeIds: string[] = [];
let supplierId = "";
let listingId = "";
let targetIds: string[] = [];

function storeInput(tenantId: string, shopId: string) {
  return {
    tenantId,
    marketplace: "mock" as const,
    externalShopId: shopId,
    shopName: `Loja ${shopId}`,
    accessTokenEnc: "enc-access",
    refreshTokenEnc: "enc-refresh",
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function createProduct(): Promise<string> {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: "Fornecedor visão geral", niche: "Teste", state: "ZZ", city: "X" })
    .returning();
  supplierId = supplier?.id ?? "";
  const [product] = await database
    .insert(supplierProducts)
    .values({
      supplierId,
      sku: "OV-1",
      title: "Produto visão",
      costCents: 1000,
      suggestedPriceCents: 2500,
      stock: 7,
    })
    .returning();
  return product?.id ?? "";
}

async function sellOne(targetId: string, status: "paid" | "cancelled") {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenantA,
      storeConnectionId: storeIds[0] ?? "",
      externalOrderId: `OV-${status}-${Date.now()}`,
      status,
      totalCents: 2500,
      marketplaceFeeCents: 300,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  await database.insert(orderItems).values({
    tenantId: tenantA,
    orderId: order?.id ?? "",
    listingTargetId: targetId,
    title: "Produto visão",
    quantity: 2,
    unitPriceCents: 2500,
    unitCostCents: 1000,
  });
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  [tenantA = "", tenantB = ""] = tenants.ids;
  const first = await upsertStoreConnection(database, storeInput(tenantA, `ov-a1-${tenantA}`));
  const second = await upsertStoreConnection(database, storeInput(tenantA, `ov-a2-${tenantA}`));
  storeIds = [first.id, second.id];
  const productId = await createProduct();
  const created = await createListingWithTargets(
    database,
    tenantA,
    { supplierProductId: productId, title: "Produto visão", description: "", priceCents: 2500 },
    storeIds,
  );
  listingId = created.listingId;
  targetIds = created.targetIds;
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.$client.end();
});

describe("listing overview", () => {
  it("returns one row per product with every store and the units sold", async () => {
    await sellOne(targetIds[0] ?? "", "paid");
    await sellOne(targetIds[0] ?? "", "cancelled");
    const result = await listListingOverview(database, tenantA, {}, page);
    expect(result.total).toBe(1);
    const [row] = result.items;
    expect(row?.stores).toHaveLength(2);
    expect(row).toMatchObject({ sku: "OV-1", stock: 7, unitsSold: 2, costCents: 1000 });
    expect(result.hasActive).toBe(true);
  });

  it("filters by the status of any store and hides other tenants", async () => {
    await markTargetFailed(database, targetIds[1] ?? "", "Recusado", { final: true });
    const failing = await listListingOverview(database, tenantA, { status: "error" }, page);
    expect(failing.items.map((row) => row.listingId)).toEqual([listingId]);
    const paused = await listListingOverview(database, tenantA, { status: "paused" }, page);
    expect(paused.total).toBe(0);
    const other = await listListingOverview(database, tenantB, {}, page);
    expect(other.total).toBe(0);
  });

  it("retries only failed stores of the tenant's listings", async () => {
    await expect(resetListingErrorsForRetry(database, tenantB, [listingId])).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await resetListingErrorsForRetry(database, tenantA, [listingId])).toEqual([
      targetIds[1],
    ]);
  });
});

describe("pause, resume and price", () => {
  it("pauses live stores, holds them at zero stock and resumes them", async () => {
    await database
      .update(listingTargets)
      .set({ status: "published", externalId: "EXT-OV", syncedStock: 7, syncedPriceCents: 2500 })
      .where(eq(listingTargets.id, targetIds[0] ?? ""));
    expect(await setListingsPaused(database, tenantA, [listingId], true)).toBe(1);
    const toSync = await findTargetsNeedingSync(database);
    expect(toSync.find((target) => target.targetId === targetIds[0])).toMatchObject({ stock: 0 });
    expect(await setListingsPaused(database, tenantA, [listingId], false)).toBe(1);
    const afterResume = await findTargetsNeedingSync(database);
    expect(afterResume.some((target) => target.targetId === targetIds[0])).toBe(false);
  });

  it("does not pause another tenant's listing", async () => {
    await expect(setListingsPaused(database, tenantB, [listingId], true)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("changes the price only above cost and only for the owner", async () => {
    await expect(updateListingPrice(database, tenantA, listingId, 900)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(updateListingPrice(database, tenantB, listingId, 3000)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await updateListingPrice(database, tenantA, listingId, 3000);
    const [row] = (await listListingOverview(database, tenantA, {}, page)).items;
    expect(row?.priceCents).toBe(3000);
  });
});
