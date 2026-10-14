import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiEvents, orderItems } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { forwardOrder, updateShipment } from "./fulfillment.ts";
import { getOrderPage } from "./order-page.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";
import { saveSupplierReview } from "./supplier-reviews.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";
const options = { platformFeeBasisPoints: 0, now: new Date() };
const address = {
  recipient: "Maria Silva",
  street: "Rua das Flores",
  number: "10",
  complement: "",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  postalCode: "01001-000",
};

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  catalog = await createTestSupplierProduct(database, {
    sku: `PAGE-${randomUUID().slice(0, 8)}`,
    title: "Camiseta",
    costCents: 1000,
    suggestedPriceCents: 5000,
    stock: 20,
  });
  storeId = (await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID())))
    .id;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

/** A paid marketplace order of two units of the test product, as the sync records it. */
async function soldOrder() {
  const externalOrderId = `PAGE-${randomUUID()}`;
  const incoming = {
    externalOrderId,
    status: "paid" as const,
    totalCents: 10_000,
    marketplaceFeeCents: 1200,
    buyerName: "Maria Silva",
    orderedAt: new Date(Date.now() - 3_600_000),
    items: [
      { externalListingId: "NOT-OURS", title: "Camiseta", quantity: 2, unitPriceCents: 5000 },
    ],
  };
  const { orderId } = await upsertMarketplaceOrder(database, tenants.tenantA, storeId, incoming);
  // The test product stands in for a published listing.
  await database
    .update(orderItems)
    .set({ supplierProductId: catalog.productId, unitCostCents: 1000 })
    .where(eq(orderItems.orderId, orderId));
  return { orderId, incoming };
}

describe("order page", () => {
  it("brings the order, its money, status history, parcels and reviews together", async () => {
    const { orderId, incoming } = await soldOrder();
    const [link] = await forwardOrder(database, tenants.tenantA, { orderId, address, notes: "" });
    if (!link) throw new Error("No link");
    const step = (
      status: "accepted" | "picking" | "ready" | "shipped" | "delivered",
      token?: string,
    ) =>
      updateShipment(
        database,
        {
          shipmentId: link.shipmentId,
          status,
          note: "",
          carrier: "Correios",
          trackingCode: "AB123BR",
          trackingUrl: "",
        },
        token ? { token } : { tenantId: tenants.tenantA },
      );
    for (const status of ["accepted", "picking", "ready", "shipped"] as const)
      await step(status, link.token);
    await step("delivered");
    // The marketplace gave R$ 5,00 back to the buyer.
    await upsertMarketplaceOrder(database, tenants.tenantA, storeId, {
      ...incoming,
      refundedCents: 500,
    });

    const page = await getOrderPage(database, tenants.tenantA, orderId, options);
    expect(page.order).toMatchObject({
      id: orderId,
      externalOrderId: incoming.externalOrderId,
      marketplace: "mock",
      buyerName: "Maria Silva",
      status: "delivered",
      items: [expect.objectContaining({ title: "Camiseta", quantity: 2, unitCostCents: 1000 })],
    });
    // Same rule as the financial report: 100,00 − 20,00 cost − 12,00 fee − 5,00 refund.
    expect(page.finance).toMatchObject({
      revenueCents: 10_000,
      costCents: 2000,
      feeCents: 1200,
      refundCents: 500,
      profitCents: 6300,
    });
    expect(page.history.map((entry) => entry.status)).toEqual(["paid", "shipped", "delivered"]);
    const times = page.history.map((entry) => entry.at.getTime());
    expect(times).toEqual(times.toSorted((left, right) => left - right));
    expect(page.shipments).toHaveLength(1);
    expect(page.shipments[0]).toMatchObject({ status: "delivered", trackingCode: "AB123BR" });
    expect(page.reviews).toEqual([
      {
        supplierId: catalog.supplierId,
        supplierName: expect.any(String),
        rating: null,
        reviewable: true,
      },
    ]);

    await saveSupplierReview(database, tenants.tenantA, {
      orderId,
      supplierId: catalog.supplierId,
      rating: 5,
      tags: [],
      comment: "",
    });
    const reviewed = await getOrderPage(database, tenants.tenantA, orderId, options);
    expect(reviewed.reviews[0]).toMatchObject({ rating: 5, reviewable: true });
  });

  it("keeps reviews closed until the order is delivered", async () => {
    const { orderId } = await soldOrder();
    const page = await getOrderPage(database, tenants.tenantA, orderId, options);
    expect(page.reviews).toEqual([expect.objectContaining({ rating: null, reviewable: false })]);
  });

  it("shows an order recorded before status events existed as one step at its date", async () => {
    const { orderId, incoming } = await soldOrder();
    await database.delete(apiEvents).where(sql`${apiEvents.data} ->> 'orderId' = ${orderId}`);
    const page = await getOrderPage(database, tenants.tenantA, orderId, options);
    expect(page.history).toEqual([{ status: "paid", at: incoming.orderedAt }]);
  });

  it("never shows another tenant's order", async () => {
    const { orderId } = await soldOrder();
    await expect(getOrderPage(database, tenants.tenantB, orderId, options)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
