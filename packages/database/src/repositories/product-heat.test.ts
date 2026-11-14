import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, storeConnections } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testStoreInput,
} from "../testing/fixtures.ts";
import { countRecentUnitsSold } from "./product-heat.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const NOW = new Date("2026-11-13T12:00:00Z");
const DAY_IN_MS = 86_400_000;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let hot: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let quiet: Awaited<ReturnType<typeof createTestSupplierProduct>>;
const storeIds: string[] = [];

function tenant(index: number): string {
  const id = tenants.ids[index];
  if (id === undefined) throw new Error(`tenant ${index} não criado`);
  return id;
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_IN_MS);
}

async function sell(input: {
  tenantId: string;
  storeId: string;
  productId: string;
  quantity: number;
  status: "paid" | "pending" | "cancelled" | "returned" | "delivered";
  orderedAt: Date;
}) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId: input.tenantId,
      storeConnectionId: input.storeId,
      externalOrderId: `heat-${crypto.randomUUID()}`,
      status: input.status,
      totalCents: 5_000,
      orderedAt: input.orderedAt,
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("pedido não criado");
  await database.insert(orderItems).values({
    tenantId: input.tenantId,
    orderId: order.id,
    supplierProductId: input.productId,
    title: "Produto",
    quantity: input.quantity,
    unitPriceCents: 5_000,
    unitCostCents: 2_000,
  });
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  hot = await createTestSupplierProduct(database, {
    sku: `HEAT-${tenant(0)}`,
    title: "Produto vendido",
    costCents: 2_000,
    suggestedPriceCents: 5_000,
  });
  quiet = await createTestSupplierProduct(database, {
    sku: `QUIET-${tenant(0)}`,
    title: "Produto parado",
    costCents: 2_000,
    suggestedPriceCents: 5_000,
  });
  for (const [index, tenantId] of [tenant(0), tenant(1)].entries()) {
    const { id } = await upsertStoreConnection(
      database,
      testStoreInput(tenantId, `heat-${index}-${tenantId}`),
    );
    storeIds.push(id);
  }
  const [storeA, storeB] = storeIds;
  if (storeA === undefined || storeB === undefined) throw new Error("lojas não criadas");
  const base = { productId: hot.productId };
  await sell({
    ...base,
    tenantId: tenant(0),
    storeId: storeA,
    quantity: 3,
    status: "paid",
    orderedAt: daysAgo(1),
  });
  await sell({
    ...base,
    tenantId: tenant(1),
    storeId: storeB,
    quantity: 2,
    status: "delivered",
    orderedAt: daysAgo(29),
  });
  await sell({
    ...base,
    tenantId: tenant(1),
    storeId: storeB,
    quantity: 7,
    status: "cancelled",
    orderedAt: daysAgo(2),
  });
  await sell({
    ...base,
    tenantId: tenant(0),
    storeId: storeA,
    quantity: 4,
    status: "pending",
    orderedAt: daysAgo(2),
  });
  await sell({
    ...base,
    tenantId: tenant(0),
    storeId: storeA,
    quantity: 9,
    status: "paid",
    orderedAt: daysAgo(31),
  });
});

afterAll(async () => {
  await database.delete(orders).where(inArray(orders.storeConnectionId, storeIds));
  await database.delete(storeConnections).where(inArray(storeConnections.id, storeIds));
  await hot.cleanup();
  await quiet.cleanup();
  await tenants.cleanup();
});

describe("countRecentUnitsSold", () => {
  it("sums paid units of every store inside the last 30 days", async () => {
    const units = await countRecentUnitsSold(database, [hot.productId], NOW);

    expect(units.get(hot.productId)).toBe(5);
  });

  it("leaves out a product with no sale in the window", async () => {
    const units = await countRecentUnitsSold(database, [hot.productId, quiet.productId], NOW);

    expect(units.has(quiet.productId)).toBe(false);
  });

  it("returns nothing for an empty page", async () => {
    const units = await countRecentUnitsSold(database, [], NOW);

    expect(units.size).toBe(0);
  });
});
