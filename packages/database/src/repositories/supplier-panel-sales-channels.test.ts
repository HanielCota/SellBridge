import { randomUUID } from "node:crypto";
import type { OrderStatus } from "@sellbridge/shared/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, supplierProducts } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  countSupplierSellingStores,
  listSupplierIdleProducts,
  listSupplierSalesByMarketplace,
} from "./supplier-panel-sales-channels.ts";

const database = createTestDatabase();

/** Fixed dates in the past, so parallel packages never share the range. */
const RANGE = { from: new Date("2024-05-01T03:00:00Z"), to: new Date("2024-05-04T03:00:00Z") };
const SOLD: readonly OrderStatus[] = ["paid", "shipped", "delivered"];

let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let idleProductId = "";
let emptyProductId = "";
const stores: Record<string, string> = {};

async function sale(tenantId: string, status: OrderStatus, quantity: number) {
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: stores[tenantId] ?? "",
      externalOrderId: `ORD-${randomUUID()}`,
      status,
      totalCents: 99_999,
      orderedAt: new Date("2024-05-02T15:00:00Z"),
    })
    .returning({ id: orders.id });
  await database.insert(orderItems).values({
    tenantId,
    orderId: order?.id ?? "",
    supplierProductId: supplier.productId,
    title: "Título do anúncio do revendedor",
    quantity,
    unitPriceCents: 99_999,
    unitCostCents: 4000,
  });
}

async function product(title: string, stock: number): Promise<string> {
  const [created] = await database
    .insert(supplierProducts)
    .values({
      supplierId: supplier.supplierId,
      sku: `IDLE-${randomUUID()}`,
      title,
      costCents: 2500,
      suggestedPriceCents: 6000,
      stock,
    })
    .returning({ id: supplierProducts.id });
  return created?.id ?? "";
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  for (const tenantId of [tenants.tenantA, tenants.tenantB]) {
    const store = await upsertStoreConnection(database, testStoreInput(tenantId, randomUUID()));
    stores[tenantId] = store.id;
  }
  supplier = await createTestSupplierProduct(database, {
    sku: `CHANNEL-${randomUUID()}`,
    title: "Vestido midi",
    costCents: 4000,
    suggestedPriceCents: 9000,
    stock: 30,
  });
  idleProductId = await product("Saia plissada", 12);
  emptyProductId = await product("Body canelado", 0);
  await sale(tenants.tenantA, "paid", 2);
  await sale(tenants.tenantB, "delivered", 1);
  await sale(tenants.tenantB, "cancelled", 5);
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

const scope = () => ({ supplierId: supplier.supplierId, range: RANGE, statuses: SOLD });

describe("listSupplierSalesByMarketplace", () => {
  it("sums the sold orders per marketplace, leaving cancellations out", async () => {
    const rows = await listSupplierSalesByMarketplace(database, scope());
    expect(rows).toEqual([{ marketplace: "mock", orders: 2, receivableCents: 12_000 }]);
  });
});

describe("countSupplierSellingStores", () => {
  it("counts each shop that sold the supplier's products once", async () => {
    expect(await countSupplierSellingStores(database, scope())).toBe(2);
  });
});

describe("listSupplierIdleProducts", () => {
  it("lists products with stock and no sale since the date", async () => {
    const idle = await listSupplierIdleProducts(database, {
      supplierId: supplier.supplierId,
      since: RANGE.from,
      statuses: SOLD,
      limit: 10,
    });
    const ids = idle.map((row) => row.productId);
    expect(ids).toContain(idleProductId);
    expect(ids).not.toContain(supplier.productId);
    expect(ids).not.toContain(emptyProductId);
    expect(idle.find((row) => row.productId === idleProductId)?.availableStock).toBe(12);
  });
});
