import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, supplierProducts } from "../schema/index.ts";
import { createTestDatabase, createTestTenantPair, testStoreInput } from "../testing/fixtures.ts";
import { createListingWithTargets, markTargetPublished } from "./listings.ts";
import { type IncomingOrder, upsertMarketplaceOrder } from "./orders.ts";
import { ensureSellerCatalog } from "./seller-catalog.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let sourceId = "";
let firstStore = "";
let secondStore = "";
let foreignStore = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  sourceId = (await ensureSellerCatalog(database, tenants.tenantA)).id;
  firstStore = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID()))
  ).id;
  secondStore = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID()))
  ).id;
  foreignStore = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantB, randomUUID()))
  ).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

async function ownedProduct(stock: number) {
  const id = randomUUID();
  await database.insert(supplierProducts).values({
    id,
    supplierId: sourceId,
    sku: id,
    title: "Own inventory product",
    description: "An owned product for inventory validation.",
    stock,
    costCents: 1200,
    suggestedPriceCents: 3000,
    active: true,
    reviewStatus: "approved",
  });
  const listing = await createListingWithTargets(
    database,
    tenants.tenantA,
    {
      supplierProductId: id,
      title: "Own inventory product",
      description: "An owned product for inventory validation.",
      priceCents: 3000,
    },
    [firstStore, secondStore],
  );
  const [first, second] = listing.targetIds;
  if (first === undefined || second === undefined) throw new Error("Missing stock targets");
  const firstExternal = randomUUID();
  const secondExternal = randomUUID();
  await markTargetPublished(database, first, { externalId: firstExternal, externalUrl: null });
  await markTargetPublished(database, second, { externalId: secondExternal, externalUrl: null });
  return { id, firstExternal, secondExternal };
}

function order(
  externalListingId: string,
  quantity: number,
  status: IncomingOrder["status"] = "paid",
): IncomingOrder {
  return {
    externalOrderId: randomUUID(),
    status,
    totalCents: quantity * 3000,
    marketplaceFeeCents: 500,
    buyerName: "Inventory test customer",
    orderedAt: new Date(),
    items: [{ externalListingId, title: "Own inventory product", quantity, unitPriceCents: 3000 }],
  };
}

async function shelf(id: string) {
  const [row] = await database
    .select({ stock: supplierProducts.stock, reserved: supplierProducts.reservedStock })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, id));
  return row;
}

async function state(orderId: string) {
  return database.query.orderItems.findFirst({ where: eq(orderItems.orderId, orderId) });
}

describe("own-product stock reservations", () => {
  it("shares shelf stock across the owner's stores and releases a cancellation once", async () => {
    const product = await ownedProduct(5);
    const incoming = [order(product.firstExternal, 3), order(product.secondExternal, 3)];
    const results = await Promise.all(
      incoming.map((item, index) =>
        upsertMarketplaceOrder(
          database,
          tenants.tenantA,
          index === 0 ? firstStore : secondStore,
          item,
        ),
      ),
    );
    const states = await Promise.all(results.map((result) => state(result.orderId)));
    expect(
      states
        .map((item) => item?.stockState ?? "")
        .toSorted((first, second) => first.localeCompare(second)),
    ).toEqual(["reserved", "short"]);
    expect(await shelf(product.id)).toEqual({ stock: 5, reserved: 3 });
    const held = states.findIndex((item) => item?.stockState === "reserved");
    const original = incoming[held];
    if (original === undefined) throw new Error("Missing held order");
    const storeId = held === 0 ? firstStore : secondStore;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await upsertMarketplaceOrder(database, tenants.tenantA, storeId, {
        ...original,
        status: "cancelled",
      });
    }
    expect(await shelf(product.id)).toEqual({ stock: 5, reserved: 3 });
    const shortIndex = held === 0 ? 1 : 0;
    const remaining = incoming[shortIndex];
    if (remaining === undefined) throw new Error("Missing remaining order");
    const remainingStore = shortIndex === 0 ? firstStore : secondStore;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await upsertMarketplaceOrder(database, tenants.tenantA, remainingStore, {
        ...remaining,
        status: "shipped",
      });
    }
    expect(await shelf(product.id)).toEqual({ stock: 2, reserved: 0 });
  });

  it("records an oversold shipment and restores exactly those units on cancellation", async () => {
    const product = await ownedProduct(1);
    const incoming = order(product.firstExternal, 2, "shipped");
    await upsertMarketplaceOrder(database, tenants.tenantA, firstStore, incoming);
    expect(await shelf(product.id)).toEqual({ stock: -1, reserved: 0 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await upsertMarketplaceOrder(database, tenants.tenantA, firstStore, {
        ...incoming,
        status: "cancelled",
      });
    }
    expect(await shelf(product.id)).toEqual({ stock: 1, reserved: 0 });
  });

  it("does not reserve private inventory for an unmatched listing in another tenant's store", async () => {
    const product = await ownedProduct(8);
    const result = await upsertMarketplaceOrder(
      database,
      tenants.tenantB,
      foreignStore,
      order(product.firstExternal, 2),
    );
    expect(await state(result.orderId)).toMatchObject({
      supplierProductId: null,
      listingTargetId: null,
    });
    expect(await shelf(product.id)).toEqual({ stock: 8, reserved: 0 });
  });
});
