import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  countPendingReviews,
  getReviewTarget,
  getSupplierReputationStats,
  listRecentSupplierReviews,
  listReviewableOrders,
  saveSupplierReview,
} from "./supplier-reviews.ts";

type OrderStatus = (typeof orders.$inferInsert)["status"];

const database = createTestDatabase();
const DAY = 86_400_000;
const LONG_AGO = new Date(Date.now() - 365 * DAY);
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let storeB = "";
const orderIds: Record<"delivered" | "cancelled" | "returned" | "otherTenant", string> = {
  delivered: "",
  cancelled: "",
  returned: "",
  otherTenant: "",
};

async function insertOrder(tenantId: string, storeId: string, status: OrderStatus) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId: `REV-${randomUUID()}`,
      status,
      totalCents: 5000,
      orderedAt: new Date(Date.now() - 5 * DAY),
    })
    .returning({ id: orders.id });
  if (!order) {
    throw new Error("pedido não criado");
  }
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: catalog.productId,
    title: "Produto avaliado",
    quantity: 2,
    unitPriceCents: 2500,
    unitCostCents: 1200,
  });
  return order.id;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  catalog = await createTestSupplierProduct(database, {
    sku: "REV-1",
    title: "Produto avaliado",
    costCents: 1200,
    suggestedPriceCents: 2500,
  });
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `rev-${tenantA}`))).id;
  storeB = (await upsertStoreConnection(database, testStoreInput(tenantB, `rev-${tenantB}`))).id;
  orderIds.delivered = await insertOrder(tenantA, storeA, "delivered");
  orderIds.cancelled = await insertOrder(tenantA, storeA, "cancelled");
  orderIds.returned = await insertOrder(tenantA, storeA, "returned");
  orderIds.otherTenant = await insertOrder(tenantB, storeB, "delivered");
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("supplier reviews", () => {
  it("lists delivered orders waiting for a review, one row per supplier", async () => {
    const pending = await listReviewableOrders(database, tenantA, {
      filters: { filter: "pending", reviewableSince: LONG_AGO },
      pagination: { page: 1, pageSize: 20 },
    });
    expect(pending.items.map((row) => row.orderId)).toEqual([orderIds.delivered]);
    expect(pending.items[0]).toMatchObject({ supplierId: catalog.supplierId, units: 2 });
    expect(await countPendingReviews(database, tenantA, LONG_AGO)).toMatchObject({ total: 1 });
  });

  it("finds the review target only inside the tenant", async () => {
    const target = { orderId: orderIds.delivered, supplierId: catalog.supplierId };
    expect(await getReviewTarget(database, tenantA, target)).toMatchObject({
      status: "delivered",
    });
    expect(await getReviewTarget(database, tenantB, target)).toBeNull();
  });

  it("saves, edits and isolates reviews", async () => {
    const target = { orderId: orderIds.delivered, supplierId: catalog.supplierId };
    await saveSupplierReview(database, tenantA, {
      ...target,
      rating: 2,
      tags: ["dispatch:bad"],
      comment: "",
    });
    await saveSupplierReview(database, tenantA, {
      ...target,
      rating: 5,
      tags: ["dispatch:good", "packaging:good"],
      comment: "Chegou antes do prazo",
    });
    // Another tenant cannot overwrite it through the unique key.
    await saveSupplierReview(database, tenantB, { ...target, rating: 1, tags: [], comment: "x" });

    const done = await listReviewableOrders(database, tenantA, {
      filters: { filter: "done", reviewableSince: LONG_AGO },
      pagination: { page: 1, pageSize: 20 },
    });
    expect(done.items[0]?.review).toMatchObject({ rating: 5, comment: "Chegou antes do prazo" });
    expect(await countPendingReviews(database, tenantA, LONG_AGO)).toMatchObject({ total: 0 });

    const recent = await listRecentSupplierReviews(database, catalog.supplierId);
    expect(recent.map((review) => review.comment)).toEqual(["Chegou antes do prazo"]);
  });

  it("aggregates reviews and order outcomes across tenants", async () => {
    await saveSupplierReview(database, tenantB, {
      orderId: orderIds.otherTenant,
      supplierId: catalog.supplierId,
      rating: 3,
      tags: ["dispatch:bad"],
      comment: "",
    });
    const stats = await getSupplierReputationStats(database, [catalog.supplierId], LONG_AGO);
    expect(stats.get(catalog.supplierId)).toMatchObject({
      reviewCount: 2,
      ratingSum: 8,
      positiveCount: 1,
      neutralCount: 1,
      orderCount: 4,
      cancelledCount: 1,
      returnedCount: 1,
      aspects: { dispatch: { good: 1, bad: 1 }, packaging: { good: 1, bad: 0 } },
    });
  });

  it("hides contact details from the comments other tenants read", async () => {
    await saveSupplierReview(database, tenantB, {
      orderId: orderIds.otherTenant,
      supplierId: catalog.supplierId,
      rating: 3,
      tags: ["dispatch:bad"],
      comment: "Atrasou. Fale comigo: (11) 98765-4321 ou loja@exemplo.com",
    });
    const recent = await listRecentSupplierReviews(database, catalog.supplierId);
    expect(recent.map((review) => review.comment)).toContain(
      "Atrasou. Fale comigo: [removido] ou [removido]",
    );
  });
});
