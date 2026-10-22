import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orderStatusChanges, orders } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { listReviewsForModeration } from "./review-moderation.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  countPendingReviews,
  getReviewTarget,
  getSupplierReputationStats,
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

/** What paying left on the order's items: a never-paid order keeps them "pending". */
const STOCK_AFTER: Record<string, "consumed" | "released"> = { cancelled: "released" };

async function insertOrder(tenantId: string, storeId: string, status: OrderStatus, paid = true) {
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
    stockState: paid ? (STOCK_AFTER[status] ?? "consumed") : "pending",
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
  // A boleto never paid: the marketplace cancels it, and it says nothing about the supplier.
  await insertOrder(tenantA, storeA, "cancelled", false);
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
  });

  it("aggregates reviews and order outcomes across tenants", async () => {
    await saveSupplierReview(database, tenantB, {
      orderId: orderIds.otherTenant,
      supplierId: catalog.supplierId,
      rating: 3,
      tags: ["dispatch:bad"],
      comment: "",
    });
    // A buyer who never paid: the marketplace cancelled the cart, the supplier did nothing.
    const abandoned = await insertOrder(tenantA, storeA, "cancelled");
    await database.insert(orderStatusChanges).values([
      { tenantId: tenantA, orderId: abandoned, status: "pending" },
      { tenantId: tenantA, orderId: abandoned, status: "cancelled" },
    ]);
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

  it("lists every review for moderation with its order and store, newest first", async () => {
    await saveSupplierReview(database, tenantB, {
      orderId: orderIds.otherTenant,
      supplierId: catalog.supplierId,
      rating: 3,
      tags: ["dispatch:bad"],
      comment: "Atrasou por culpa da transportadora",
    });
    const reviews = await listReviewsForModeration(
      database,
      { supplierId: catalog.supplierId, withCommentOnly: false },
      { page: 1, pageSize: 20 },
    );
    expect(reviews.total).toBe(2);
    expect(reviews.items).toEqual([
      expect.objectContaining({
        rating: 3,
        tags: ["dispatch:bad"],
        comment: "Atrasou por culpa da transportadora",
        externalOrderId: expect.stringMatching(/^REV-/),
        storeName: `Loja rev-${tenantB}`,
        supplierId: catalog.supplierId,
        supplierName: "Fornecedor de teste REV-1",
      }),
      expect.objectContaining({
        rating: 5,
        comment: "Chegou antes do prazo",
        storeName: `Loja rev-${tenantA}`,
      }),
    ]);
  });

  it("pages the moderation list and keeps reviews of other suppliers out", async () => {
    const second = await listReviewsForModeration(
      database,
      { supplierId: catalog.supplierId, withCommentOnly: false },
      { page: 2, pageSize: 1 },
    );
    expect(second.items.map((review) => review.comment)).toEqual(["Chegou antes do prazo"]);
    expect(second.total).toBe(2);
    const otherSupplier = await listReviewsForModeration(
      database,
      { supplierId: randomUUID(), withCommentOnly: false },
      { page: 1, pageSize: 20 },
    );
    expect(otherSupplier.items).toEqual([]);
  });

  it("lists reviews of every supplier, with the supplier's name, when none is given", async () => {
    const everyone = await listReviewsForModeration(
      database,
      { withCommentOnly: false },
      { page: 1, pageSize: 100 },
    );
    const ours = everyone.items.filter((review) => review.supplierId === catalog.supplierId);
    expect(ours.map((review) => review.supplierName)).toEqual([
      "Fornecedor de teste REV-1",
      "Fornecedor de teste REV-1",
    ]);
    expect(everyone.total).toBeGreaterThanOrEqual(2);
  });

  it("leaves blank and whitespace-only comments out when only commented reviews are asked", async () => {
    await saveSupplierReview(database, tenantB, {
      orderId: orderIds.otherTenant,
      supplierId: catalog.supplierId,
      rating: 3,
      tags: ["dispatch:bad"],
      // Line breaks and tabs only: the screen shows "Sem comentário.", so the filter drops it.
      comment: " \n\t ",
    });
    const commented = await listReviewsForModeration(
      database,
      { supplierId: catalog.supplierId, withCommentOnly: true },
      { page: 1, pageSize: 20 },
    );
    expect(commented.items.map((review) => review.comment)).toEqual(["Chegou antes do prazo"]);
    expect(commented.total).toBe(1);
    const all = await listReviewsForModeration(
      database,
      { supplierId: catalog.supplierId, withCommentOnly: false },
      { page: 1, pageSize: 20 },
    );
    expect(all.total).toBe(2);
  });

  it("hides contact details left in old comments, even from the team", async () => {
    await saveSupplierReview(database, tenantB, {
      orderId: orderIds.otherTenant,
      supplierId: catalog.supplierId,
      rating: 3,
      tags: ["dispatch:bad"],
      comment: "Atrasou. Fale comigo: (11) 98765-4321 ou loja@exemplo.com",
    });
    const reviews = await listReviewsForModeration(
      database,
      { supplierId: catalog.supplierId, withCommentOnly: true },
      { page: 1, pageSize: 20 },
    );
    expect(reviews.items.map((review) => review.comment)).toContain(
      "Atrasou. Fale comigo: [removido] ou [removido]",
    );
  });
});

describe("supplier reputation query plan", () => {
  // Same shape as orderTotals in supplier-reviews.ts.
  it("keeps product-index lookups available without fixing the optimizer's join order", async () => {
    const plan = await database.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      const reputation = await transaction.execute(sql`
        explain select sp.supplier_id, count(distinct o.id)
        from orders o
        join order_items oi on oi.order_id = o.id
        join supplier_products sp on sp.id = oi.supplier_product_id
        where sp.supplier_id in (${catalog.supplierId}::uuid)
          and o.ordered_at >= ${new Date(Date.now() - 90 * DAY).toISOString()}::timestamptz
        group by sp.supplier_id
      `);
      // Tiny fixtures can favor starting from orders; the product lookup must remain indexed.
      const lookup = await transaction.execute(sql`
        explain select id from order_items
        where supplier_product_id = ${catalog.productId}::uuid
      `);
      return { reputation, lookup };
    });
    expect(JSON.stringify([...plan.reputation])).toMatch(/Index(?: Only)? Scan|Bitmap.*Scan/);
    expect(JSON.stringify([...plan.lookup])).toContain("order_items_supplier_product_idx");
  });
});
