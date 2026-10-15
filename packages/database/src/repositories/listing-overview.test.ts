import { DEFAULT_FEE_SCHEDULE, minimumPriceCents } from "@sellbridge/shared/fee-model";
import { eq, sql } from "drizzle-orm";
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
  getListingOverview,
  listListingOverview,
  resetListingErrorsForRetry,
  setListingsPaused,
  updateListingPrice,
} from "./listing-overview.ts";
import { createListingWithTargets, findTargetsNeedingSync, markTargetFailed } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
/** 14% marketplace and 4% SellBridge, no minimum margin: a price must at least break even. */
const feeSchedule = { ...DEFAULT_FEE_SCHEDULE, platformFeeBasisPoints: 400 };
const page = { page: 1, pageSize: 20 };
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let tenantA = "";
let tenantB = "";
let storeIds: string[] = [];
let supplierId = "";
let listingId = "";
let targetIds: string[] = [];

/** A price change of the shared listing under the test's fees. */
function change(priceCents: number) {
  return { listingId, priceCents, feeSchedule };
}

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

async function sellOne(
  targetId: string,
  status: "paid" | "cancelled",
  orderedAt: Date = new Date(),
) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenantA,
      storeConnectionId: storeIds[0] ?? "",
      externalOrderId: `OV-${status}-${orderedAt.getTime()}-${Date.now()}`,
      status,
      totalCents: 2500,
      marketplaceFeeCents: 300,
      orderedAt,
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
    expect(row?.supplierName).toBe("Fornecedor visão geral");
    expect(result.hasActive).toBe(true);
  });

  it("loads one listing like a row of the overview, only for its tenant", async () => {
    const row = await getListingOverview(database, tenantA, listingId);
    expect(row).toMatchObject({ listingId, sku: "OV-1", unitsSold: 2 });
    expect(row.productId).not.toBe("");
    expect(row.stores.map((store) => store.storeConnectionId).toSorted()).toEqual(
      [...storeIds].toSorted(),
    );
    await expect(getListingOverview(database, tenantB, listingId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("spreads the units sold over the last 30 days, today last", async () => {
    const [row] = (await listListingOverview(database, tenantA, {}, page)).items;
    expect(row?.dailySales).toHaveLength(30);
    expect(row?.dailySales.at(-1)).toBe(2);
    expect(row?.dailySales.slice(0, -1).every((units) => units === 0)).toBe(true);
  });

  it("counts the same window on the card that the sort uses", async () => {
    const day = 86_400_000;
    await sellOne(targetIds[0] ?? "", "paid", new Date(Date.now() + day));
    await sellOne(targetIds[0] ?? "", "paid", new Date(Date.now() - 31 * day));
    const [row] = (await listListingOverview(database, tenantA, {}, page)).items;
    expect(row?.unitsSold).toBe(2);
    expect(row?.dailySales.reduce((total, units) => total + units, 0)).toBe(2);
  });

  it("sorts by units sold when asked", async () => {
    const result = await listListingOverview(database, tenantA, { sort: "best_selling" }, page);
    expect(result.items.map((row) => row.listingId)).toEqual([listingId]);
  });

  it("ignores sold items recorded under another tenant", async () => {
    const [order] = await database
      .insert(orders)
      .values({
        tenantId: tenantB,
        storeConnectionId: storeIds[0] ?? "",
        externalOrderId: `OV-foreign-${Date.now()}`,
        status: "paid",
        totalCents: 2500,
        orderedAt: new Date(),
      })
      .returning({ id: orders.id });
    await database.insert(orderItems).values({
      tenantId: tenantB,
      orderId: order?.id ?? "",
      listingTargetId: targetIds[0] ?? "",
      title: "Item de outro tenant",
      quantity: 5,
      unitPriceCents: 2500,
      unitCostCents: 1000,
    });
    const [row] = (await listListingOverview(database, tenantA, {}, page)).items;
    expect(row?.unitsSold).toBe(2);
  });

  it("reaches the sold items of a listing through an index", async () => {
    const plan = await database.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      return transaction.execute(sql`
        explain select coalesce(sum(oi.quantity), 0) from order_items oi
        where oi.listing_target_id = ${targetIds[0] ?? ""}::uuid
      `);
    });
    expect(JSON.stringify([...plan])).toContain("order_items_listing_target_idx");
  });

  it("filters by the status of any store and hides other tenants", async () => {
    await markTargetFailed(database, targetIds[1] ?? "", "Recusado", { final: true });
    const failing = await listListingOverview(database, tenantA, { status: "error" }, page);
    expect(failing.items.map((row) => row.listingId)).toEqual([listingId]);
    expect(failing.statusCounts).toEqual({ all: 1, published: 0, error: 1, paused: 0 });
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

  it("changes the price only above the fee floor and only for the owner", async () => {
    await expect(updateListingPrice(database, tenantA, change(900))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(updateListingPrice(database, tenantB, change(3000))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await updateListingPrice(database, tenantA, change(3000));
    const [row] = (await listListingOverview(database, tenantA, {}, page)).items;
    expect(row?.priceCents).toBe(3000);
  });

  it("refuses a price above cost that loses money after the fees", async () => {
    const [before] = (await listListingOverview(database, tenantA, {}, page)).items;
    const costCents = before?.costCents ?? 0;
    const minimum = minimumPriceCents({ costCents }, feeSchedule) ?? 0;
    await expect(
      updateListingPrice(database, tenantA, { listingId, priceCents: minimum - 1, feeSchedule }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("preço mínimo para não ter prejuízo"),
    });
    await updateListingPrice(database, tenantA, { listingId, priceCents: minimum, feeSchedule });
    const [after] = (await listListingOverview(database, tenantA, {}, page)).items;
    expect(after?.priceCents).toBe(minimum);
  });

  it("keeps the configured minimum margin", async () => {
    const strict = { ...feeSchedule, minimumMarginPercent: 10 };
    const [before] = (await listListingOverview(database, tenantA, {}, page)).items;
    const minimum = minimumPriceCents({ costCents: before?.costCents ?? 0 }, strict) ?? 0;
    await expect(
      updateListingPrice(database, tenantA, {
        listingId,
        priceCents: minimum - 1,
        feeSchedule: strict,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("para 10% de margem") });
  });
});
