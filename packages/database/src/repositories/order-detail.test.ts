import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderAdjustments, orderItems, orders } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets } from "./listings.ts";
import { getOrderDetail } from "./order-detail.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let listingId = "";
let orderId = "";

async function insertOrder(listingTargetId: string): Promise<string> {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenantA,
      storeConnectionId: storeA,
      externalOrderId: `OD-${randomUUID()}`,
      status: "delivered",
      totalCents: 9980,
      marketplaceFeeCents: 1400,
      buyerName: "Mariana",
      orderedAt: new Date("2026-03-01T13:00:00Z"),
      deliveredAt: new Date("2026-03-04T15:00:00Z"),
    })
    .returning({ id: orders.id });
  if (!order) {
    throw new Error("pedido não criado");
  }
  await database.insert(orderItems).values([
    {
      tenantId: tenantA,
      orderId: order.id,
      listingTargetId,
      supplierProductId: catalog.productId,
      title: "Anúncio OD",
      quantity: 2,
      unitPriceCents: 3990,
      unitCostCents: 1500,
    },
    {
      tenantId: tenantA,
      orderId: order.id,
      title: "Brinde sem vínculo",
      quantity: 1,
      unitPriceCents: 2000,
      unitCostCents: 0,
    },
  ]);
  await database.insert(orderAdjustments).values([
    { tenantId: tenantA, orderId: order.id, type: "refund", amountCents: 500, reason: "Avaria" },
    { tenantId: tenantA, orderId: order.id, type: "commission", amountCents: 300 },
  ]);
  return order.id;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  catalog = await createTestSupplierProduct(database, {
    sku: "OD-1",
    title: "Produto OD",
    costCents: 1500,
    suggestedPriceCents: 3990,
  });
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `od-${tenantA}`))).id;
  const created = await createListingWithTargets(
    database,
    tenantA,
    {
      supplierProductId: catalog.productId,
      title: "Anúncio OD",
      description: "Descrição",
      priceCents: 3990,
    },
    [storeA],
  );
  listingId = created.listingId;
  orderId = await insertOrder(created.targetIds[0] ?? "");
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("order detail", () => {
  it("returns the order with its store, items and adjustments", async () => {
    const detail = await getOrderDetail(database, tenantA, orderId);
    expect(detail).toMatchObject({
      id: orderId,
      storeConnectionId: storeA,
      storeName: `Loja od-${tenantA}`,
      status: "delivered",
      totalCents: 9980,
      marketplaceFeeCents: 1400,
      buyerName: "Mariana",
      deliveredAt: new Date("2026-03-04T15:00:00Z"),
    });
    expect(detail.items).toEqual([
      expect.objectContaining({
        title: "Anúncio OD",
        quantity: 2,
        unitCostCents: 1500,
        listingId,
        productId: catalog.productId,
      }),
      expect.objectContaining({ title: "Brinde sem vínculo", listingId: null, productId: null }),
    ]);
    expect(detail.adjustments.map((adjustment) => adjustment.type).toSorted()).toEqual([
      "commission",
      "refund",
    ]);
  });

  it("does not show one tenant's order to another", async () => {
    await expect(getOrderDetail(database, tenantB, orderId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is not found for an unknown order", async () => {
    await expect(getOrderDetail(database, tenantA, randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
