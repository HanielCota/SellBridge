import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orders, storeConnections, supplierProducts } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testStoreInput,
} from "../testing/fixtures.ts";
import { upsertStoreConnection } from "./stores.ts";
import { listSellableCatalog } from "./suppliers.ts";

const database = createTestDatabase();
const NOW = new Date("2026-11-15T12:00:00Z");
const DAY_IN_MS = 86_400_000;
const BEST_SELLERS = { sort: "best_sellers" as const };
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
const storeIds: string[] = [];
const productIdsByTitle = new Map<string, string>();

function tenant(index: number): string {
  const id = tenants.ids[index];
  if (id === undefined) throw new Error(`tenant ${index} não criado`);
  return id;
}

function productId(title: string): string {
  const id = productIdsByTitle.get(title);
  if (id === undefined) throw new Error(`produto ${title} não criado`);
  return id;
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_IN_MS);
}

async function sell(input: {
  storeIndex: number;
  title: string;
  quantity: number;
  status: "paid" | "delivered" | "cancelled" | "pending";
  orderedAt: Date;
}) {
  const storeId = storeIds[input.storeIndex];
  if (storeId === undefined) throw new Error(`loja ${input.storeIndex} não criada`);
  const tenantId = tenant(input.storeIndex);
  const [order] = await database
    .insert(orders)
    .values({
      tenantId,
      storeConnectionId: storeId,
      externalOrderId: `best-${crypto.randomUUID()}`,
      status: input.status,
      totalCents: 5_000,
      orderedAt: input.orderedAt,
    })
    .returning({ id: orders.id });
  if (order === undefined) throw new Error("pedido não criado");
  await database.insert(orderItems).values({
    tenantId,
    orderId: order.id,
    supplierProductId: productId(input.title),
    title: input.title,
    quantity: input.quantity,
    unitPriceCents: 5_000,
    unitCostCents: 2_000,
  });
}

async function titlesOnPage(page: number, pageSize: number): Promise<string[]> {
  const result = await listSellableCatalog(
    database,
    tenant(0),
    { ...BEST_SELLERS, supplierId: supplier.supplierId, now: NOW },
    { page, pageSize },
  );
  return result.items.map((item) => item.title);
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  supplier = await createTestSupplierProduct(database, {
    sku: `BEST-A-${tenant(0)}`,
    title: "Alfa",
    costCents: 2_000,
    suggestedPriceCents: 5_000,
  });
  productIdsByTitle.set("Alfa", supplier.productId);
  const others = await database
    .insert(supplierProducts)
    .values(
      ["Bravo", "Charlie", "Delta", "Echo", "Foxtrot"].map((title) => ({
        supplierId: supplier.supplierId,
        sku: `BEST-${title}-${tenant(0)}`,
        title,
        costCents: 2_000,
        suggestedPriceCents: 5_000,
      })),
    )
    .returning({ id: supplierProducts.id, title: supplierProducts.title });
  for (const product of others) {
    productIdsByTitle.set(product.title, product.id);
  }
  for (const [index, tenantId] of [tenant(0), tenant(1)].entries()) {
    const { id } = await upsertStoreConnection(
      database,
      testStoreInput(tenantId, `best-${index}-${tenantId}`),
    );
    storeIds.push(id);
  }
  // Bravo: 10 units over two resellers' stores. Alfa and Charlie: 3 each, a tie.
  await sell({ storeIndex: 0, title: "Bravo", quantity: 6, status: "paid", orderedAt: daysAgo(1) });
  await sell({
    storeIndex: 1,
    title: "Bravo",
    quantity: 4,
    status: "delivered",
    orderedAt: daysAgo(20),
  });
  await sell({
    storeIndex: 1,
    title: "Charlie",
    quantity: 3,
    status: "paid",
    orderedAt: daysAgo(2),
  });
  await sell({ storeIndex: 0, title: "Alfa", quantity: 3, status: "paid", orderedAt: daysAgo(29) });
  // Sales that do not count: out of the 30 days, cancelled, unpaid.
  await sell({
    storeIndex: 0,
    title: "Delta",
    quantity: 40,
    status: "paid",
    orderedAt: daysAgo(31),
  });
  await sell({
    storeIndex: 1,
    title: "Echo",
    quantity: 50,
    status: "cancelled",
    orderedAt: daysAgo(1),
  });
  await sell({
    storeIndex: 0,
    title: "Foxtrot",
    quantity: 60,
    status: "pending",
    orderedAt: daysAgo(1),
  });
});

afterAll(async () => {
  await database.delete(orders).where(inArray(orders.storeConnectionId, storeIds));
  await database.delete(storeConnections).where(inArray(storeConnections.id, storeIds));
  await supplier.cleanup();
  await tenants.cleanup();
});

describe("listSellableCatalog sorted by best sellers", () => {
  it("lists the most units sold in the last 30 days first, ties and products without sales by name", async () => {
    const titles = await titlesOnPage(1, 10);

    expect(titles).toEqual(["Bravo", "Alfa", "Charlie", "Delta", "Echo", "Foxtrot"]);
  });

  it("shows every product once across pages", async () => {
    const pages = [await titlesOnPage(1, 4), await titlesOnPage(2, 4)];

    expect(pages).toEqual([
      ["Bravo", "Alfa", "Charlie", "Delta"],
      ["Echo", "Foxtrot"],
    ]);
  });

  it("drops sales that leave the 30 days", async () => {
    const result = await listSellableCatalog(
      database,
      tenant(0),
      {
        ...BEST_SELLERS,
        supplierId: supplier.supplierId,
        now: new Date(NOW.getTime() + 2 * DAY_IN_MS),
      },
      { page: 1, pageSize: 10 },
    );

    // Alfa's sale is now 31 days old: Charlie keeps its 3 units and Alfa joins the unsold.
    expect(result.items.map((item) => item.title)).toEqual([
      "Bravo",
      "Charlie",
      "Alfa",
      "Delta",
      "Echo",
      "Foxtrot",
    ]);
  });
});
