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
import { countResellerToDos } from "./reseller-to-dos.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;

async function createOrder(tenantId: string, status: "paid" | "pending" | "cancelled") {
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, randomUUID()));
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: store.id,
      externalOrderId: randomUUID(),
      status,
      totalCents: 5000,
      orderedAt: new Date(),
    })
    .returning();
  if (order === undefined) throw new Error("Test order was not created");
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: supplier.productId,
    title: "Camiseta",
    quantity: 1,
    unitPriceCents: 5000,
    unitCostCents: 1000,
  });
  return order;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  supplier = await createTestSupplierProduct(database, {
    sku: "TODO-A",
    title: "Camiseta",
    costCents: 1000,
    suggestedPriceCents: 5000,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

describe("reseller to-dos", () => {
  it("counts only the tenant's paid orders that were not sent to the supplier yet", async () => {
    await createOrder(tenants.tenantA, "paid");
    await createOrder(tenants.tenantA, "pending");
    await createOrder(tenants.tenantA, "cancelled");
    await createOrder(tenants.tenantB, "paid");
    const sent = await createOrder(tenants.tenantA, "paid");
    await forwardOrder(database, tenants.tenantA, {
      orderId: sent.id,
      address: testAddress,
      notes: "",
    });

    const toDos = await countResellerToDos(database, tenants.tenantA);

    expect(toDos.ordersToForward).toBe(1);
    expect(toDos.supplierPaymentsDue).toBe(0);
  });
});
