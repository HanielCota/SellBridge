import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testAddress,
  testStoreInput,
} from "../testing/fixtures.ts";
import { forwardOrder } from "./fulfillment.ts";
import { findOrderLabelParcels } from "./order-label-parcels.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let storeId = "";

/** A forwarded Mercado Livre order with one line per product, in the given cart. */
async function forwardedOrder(productIds: readonly string[], packId: string | null = null) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      externalOrderId: `PED-${randomUUID().slice(0, 8)}`,
      marketplacePackId: packId,
      status: "paid",
      totalCents: 5000,
      orderedAt: new Date(),
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("No order");
  await database.insert(orderItems).values(
    productIds.map((supplierProductId) => ({
      tenantId: tenants.tenantA,
      orderId: order.id,
      supplierProductId,
      title: "Camiseta",
      quantity: 1,
      unitPriceCents: 5000,
      unitCostCents: 1000,
    })),
  );
  await forwardOrder(database, tenants.tenantA, {
    orderId: order.id,
    address: testAddress,
    notes: "",
  });
  return order.id;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplier = await createTestSupplierProduct(database, {
    sku: `LABEL-${randomUUID().slice(0, 6)}`,
    title: "Camiseta",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  otherSupplier = await createTestSupplierProduct(database, {
    sku: `LABEL-${randomUUID().slice(0, 6)}`,
    title: "Calça",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
  storeId = (
    await upsertStoreConnection(database, {
      ...testStoreInput(tenants.tenantA, randomUUID()),
      marketplace: "mercado_livre",
    })
  ).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await otherSupplier.cleanup();
  await database.$client.end();
});

describe("findOrderLabelParcels", () => {
  it("counts only the order's own parcel when it was bought alone", async () => {
    const orderId = await forwardedOrder([supplier.productId]);

    const parcels = await findOrderLabelParcels(database, tenants.tenantA, orderId);

    expect(parcels).toEqual({ parcelCount: 1, supplierIds: [supplier.supplierId] });
  });

  it("counts both parcels of an order split between suppliers", async () => {
    const orderId = await forwardedOrder([supplier.productId, otherSupplier.productId]);

    const parcels = await findOrderLabelParcels(database, tenants.tenantA, orderId);

    expect(parcels.parcelCount).toBe(2);
    expect(parcels.supplierIds.toSorted()).toEqual(
      [supplier.supplierId, otherSupplier.supplierId].toSorted(),
    );
  });

  it("counts the suppliers of the other orders in the same cart", async () => {
    const packId = `PACK-${randomUUID().slice(0, 8)}`;
    const orderId = await forwardedOrder([supplier.productId], packId);
    await forwardedOrder([otherSupplier.productId], packId);
    await forwardedOrder([otherSupplier.productId], `PACK-${randomUUID().slice(0, 8)}`);

    const parcels = await findOrderLabelParcels(database, tenants.tenantA, orderId);

    expect(parcels.parcelCount).toBe(1);
    expect(parcels.supplierIds.toSorted()).toEqual(
      [supplier.supplierId, otherSupplier.supplierId].toSorted(),
    );
  });

  it("finds nothing for another tenant's order", async () => {
    const orderId = await forwardedOrder([supplier.productId]);

    const parcels = await findOrderLabelParcels(database, tenants.tenantB, orderId);

    expect(parcels).toEqual({ parcelCount: 0, supplierIds: [] });
  });
});
