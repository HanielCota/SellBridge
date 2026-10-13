import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orderItems, orderShipments, orders, supplierProducts } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  createListingWithTargets,
  findTargetsNeedingSync,
  markTargetPublished,
} from "./listings.ts";
import { type IncomingOrder, upsertMarketplaceOrder } from "./orders.ts";
import { syncOrderFromShipments } from "./fulfillment-status.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
const cleanups: (() => Promise<void>)[] = [];

interface Seller {
  tenantId: string;
  storeId: string;
}

/** A supplier product with `stock` units, published by both resellers. */
async function sharedProduct(stock: number) {
  const sku = `R-${randomUUID().slice(0, 8)}`;
  const catalog = await createTestSupplierProduct(database, {
    sku,
    title: `Produto ${sku}`,
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock,
  });
  cleanups.push(catalog.cleanup);
  const sellers: Seller[] = [];
  for (const tenantId of [tenants.tenantA, tenants.tenantB]) {
    const store = await upsertStoreConnection(
      database,
      testStoreInput(tenantId, `shop-${sku}-${tenantId}`),
    );
    const created = await createListingWithTargets(
      database,
      tenantId,
      {
        supplierProductId: catalog.productId,
        title: sku,
        description: "Descrição",
        priceCents: 3990,
      },
      [store.id],
    );
    const [targetId] = created.targetIds;
    if (!targetId) {
      throw new Error("destino");
    }
    await markTargetPublished(database, targetId, {
      externalId: `EXT-${sku}-${tenantId}`,
      externalUrl: null,
    });
    sellers.push({ tenantId, storeId: store.id });
  }
  const [first, second] = sellers;
  if (!first || !second) {
    throw new Error("revendedores");
  }
  return { productId: catalog.productId, supplierId: catalog.supplierId, sku, first, second };
}

function orderOf(
  seller: Seller,
  sku: string,
  input: { status: IncomingOrder["status"]; quantity: number },
): IncomingOrder {
  return {
    externalOrderId: `ORD-${randomUUID()}`,
    status: input.status,
    totalCents: 3990 * input.quantity,
    marketplaceFeeCents: 500,
    buyerName: "Comprador",
    orderedAt: new Date("2026-10-01T12:00:00Z"),
    items: [
      {
        externalListingId: `EXT-${sku}-${seller.tenantId}`,
        title: sku,
        quantity: input.quantity,
        unitPriceCents: 3990,
      },
    ],
  };
}

/** Shelf count and units held. */
async function shelfOf(productId: string): Promise<{ stock: number; reserved: number }> {
  const [row] = await database
    .select({ stock: supplierProducts.stock, reserved: supplierProducts.reservedStock })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  if (!row) {
    throw new Error("produto");
  }
  return row;
}

async function stateOf(orderId: string): Promise<string | undefined> {
  const [row] = await database
    .select({ state: orderItems.stockState })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  return row?.state;
}

async function sell(seller: Seller, order: IncomingOrder) {
  return upsertMarketplaceOrder(database, seller.tenantId, seller.storeId, order);
}

async function setShelf(productId: string, stock: number): Promise<void> {
  await database.update(supplierProducts).set({ stock }).where(eq(supplierProducts.id, productId));
}

function byName(first: string | undefined, second: string | undefined): number {
  return (first ?? "").localeCompare(second ?? "");
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
});

afterAll(async () => {
  await tenants.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await database.$client.end();
});

describe("holding stock for paid orders", () => {
  it("holds the units when the order is paid, leaving the shelf count alone", async () => {
    const product = await sharedProduct(5);
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 2 });
    const result = await sell(product.first, order);
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 2 });
    expect(await stateOf(result.orderId)).toBe("reserved");
  });

  it("waits for payment, then holds the units once", async () => {
    const product = await sharedProduct(5);
    const pending = orderOf(product.first, product.sku, { status: "pending", quantity: 1 });
    const result = await sell(product.first, pending);
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 0 });
    expect(await stateOf(result.orderId)).toBe("pending");

    await sell(product.first, { ...pending, status: "paid" });
    await sell(product.first, { ...pending, status: "paid" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 1 });
  });

  it("gives the last unit to one of two simultaneous sales", async () => {
    const product = await sharedProduct(1);
    const [fromA, fromB] = await Promise.all([
      sell(product.first, orderOf(product.first, product.sku, { status: "paid", quantity: 1 })),
      sell(product.second, orderOf(product.second, product.sku, { status: "paid", quantity: 1 })),
    ]);
    expect(await shelfOf(product.productId)).toEqual({ stock: 1, reserved: 1 });
    const states = [await stateOf(fromA.orderId), await stateOf(fromB.orderId)].toSorted(byName);
    expect(states).toEqual(["reserved", "short"]);
  });

  it("splits 3 units among 8 simultaneous sales: exactly 3 held", async () => {
    const product = await sharedProduct(3);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => {
        const seller = index % 2 === 0 ? product.first : product.second;
        return sell(seller, orderOf(seller, product.sku, { status: "paid", quantity: 1 }));
      }),
    );
    const states = await Promise.all(results.map((result) => stateOf(result.orderId)));
    expect(states.filter((state) => state === "reserved")).toHaveLength(3);
    expect(states.filter((state) => state === "short")).toHaveLength(5);
    expect(await shelfOf(product.productId)).toEqual({ stock: 3, reserved: 3 });
  });

  it("holds a short item once stock comes back", async () => {
    const product = await sharedProduct(0);
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 1 });
    const result = await sell(product.first, order);
    expect(await stateOf(result.orderId)).toBe("short");

    await setShelf(product.productId, 3);
    await sell(product.first, order);
    expect(await shelfOf(product.productId)).toEqual({ stock: 3, reserved: 1 });
    expect(await stateOf(result.orderId)).toBe("reserved");
  });

  it("keeps the supplier's last update date: a sale is not a new stock count", async () => {
    const product = await sharedProduct(5);
    const before = new Date("2026-10-01T09:00:00Z");
    await database
      .update(supplierProducts)
      .set({ updatedAt: before })
      .where(eq(supplierProducts.id, product.productId));
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 1 });
    await sell(product.first, order);
    await sell(product.first, { ...order, status: "shipped" });
    await sell(product.first, { ...order, status: "returned" });
    const [row] = await database
      .select({ updatedAt: supplierProducts.updatedAt })
      .from(supplierProducts)
      .where(eq(supplierProducts.id, product.productId));
    expect(row?.updatedAt).toEqual(before);
  });

  it("keeps the hold when the admin re-enters the shelf count", async () => {
    const product = await sharedProduct(10);
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 2 });
    await sell(product.first, order);
    // The supplier still has the 2 units on the shelf and reports 10 again.
    await setShelf(product.productId, 10);
    expect(await shelfOf(product.productId)).toEqual({ stock: 10, reserved: 2 });

    // Cancelling lets go of the hold without inventing units.
    await sell(product.first, { ...order, status: "cancelled" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 10, reserved: 0 });
  });
});

describe("units leaving and coming back", () => {
  it("takes held units off the shelf when the order ships", async () => {
    const product = await sharedProduct(5);
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 2 });
    const result = await sell(product.first, order);
    await sell(product.first, { ...order, status: "shipped" });
    await sell(product.first, { ...order, status: "delivered" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 3, reserved: 0 });
    expect(await stateOf(result.orderId)).toBe("consumed");
  });

  it("takes held units off the shelf when the supplier marks the shipment sent", async () => {
    const product = await sharedProduct(5);
    const result = await sell(
      product.first,
      orderOf(product.first, product.sku, { status: "paid", quantity: 2 }),
    );
    await database.insert(orderShipments).values({
      tenantId: product.first.tenantId,
      orderId: result.orderId,
      supplierId: product.supplierId,
      status: "shipped",
      address: {
        recipient: "Comprador",
        street: "Rua A",
        number: "10",
        complement: "",
        neighborhood: "Centro",
        city: "Cidade",
        state: "SP",
        postalCode: "01001000",
      },
      items: [],
    });
    const [order] = await database.select().from(orders).where(eq(orders.id, result.orderId));
    if (!order) {
      throw new Error("pedido");
    }
    await syncOrderFromShipments(database, order);
    expect(await shelfOf(product.productId)).toEqual({ stock: 3, reserved: 0 });
    expect(await stateOf(result.orderId)).toBe("consumed");
  });

  it("counts a shipment beyond the shelf count and gives the same units back on return", async () => {
    const product = await sharedProduct(1);
    const order = orderOf(product.first, product.sku, { status: "delivered", quantity: 2 });
    await sell(product.first, order);
    // The supplier shipped 2 although our count said 1: the shelf owes one, nothing to sell.
    expect(await shelfOf(product.productId)).toEqual({ stock: -1, reserved: 0 });
    await sell(product.first, { ...order, status: "returned" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 1, reserved: 0 });
  });

  it("holds and lets go of every product of a multi-item order", async () => {
    const first = await sharedProduct(4);
    const second = await sharedProduct(4);
    // The same store also sells the second product.
    const listing = await createListingWithTargets(
      database,
      first.first.tenantId,
      {
        supplierProductId: second.productId,
        title: second.sku,
        description: "Descrição",
        priceCents: 3990,
      },
      [first.first.storeId],
    );
    const [targetId] = listing.targetIds;
    const single = orderOf(first.first, first.sku, { status: "paid", quantity: 1 });
    const [itemA] = single.items;
    if (!targetId || !itemA) {
      throw new Error("itens");
    }
    await markTargetPublished(database, targetId, {
      externalId: `MULTI-${second.sku}`,
      externalUrl: null,
    });
    const itemB = {
      externalListingId: `MULTI-${second.sku}`,
      title: second.sku,
      quantity: 3,
      unitPriceCents: 3990,
    };
    const order = {
      ...single,
      // The marketplace sends items in any order; locks must not depend on it.
      items: [itemB, itemA],
    };
    await sell(first.first, order);
    expect(await shelfOf(first.productId)).toEqual({ stock: 4, reserved: 1 });
    expect(await shelfOf(second.productId)).toEqual({ stock: 4, reserved: 3 });
    await sell(first.first, { ...order, status: "cancelled" });
    expect(await shelfOf(first.productId)).toEqual({ stock: 4, reserved: 0 });
    expect(await shelfOf(second.productId)).toEqual({ stock: 4, reserved: 0 });
  });

  it("lets go of the hold once when the order is cancelled, however often it is re-sent", async () => {
    const product = await sharedProduct(5);
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 2 });
    const result = await sell(product.first, order);
    await sell(product.first, { ...order, status: "cancelled" });
    await sell(product.first, { ...order, status: "cancelled" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 0 });
    expect(await stateOf(result.orderId)).toBe("released");

    // Released is final: a reopened order does not hold the stock again.
    await sell(product.first, { ...order, status: "paid" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 0 });
  });

  it("puts units back on the shelf when a shipped order is returned", async () => {
    const product = await sharedProduct(5);
    const order = orderOf(product.first, product.sku, { status: "delivered", quantity: 1 });
    await sell(product.first, order);
    expect(await shelfOf(product.productId)).toEqual({ stock: 4, reserved: 0 });
    await sell(product.first, { ...order, status: "returned" });
    await sell(product.first, { ...order, status: "returned" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 0 });
  });

  it("closes a shortage on cancel without adding units that were never held", async () => {
    const product = await sharedProduct(0);
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 1 });
    const result = await sell(product.first, order);
    await sell(product.first, { ...order, status: "cancelled" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 0, reserved: 0 });
    expect(await stateOf(result.orderId)).toBe("released");
  });

  it("sends only the sellable units to the marketplaces", async () => {
    const product = await sharedProduct(5);
    await sell(product.first, orderOf(product.first, product.sku, { status: "paid", quantity: 2 }));
    const targets = await findTargetsNeedingSync(database, 100_000);
    const ours = targets.filter((target) => target.externalId.startsWith(`EXT-${product.sku}`));
    expect(ours.map((target) => target.stock)).toEqual([3, 3]);
  });
});

describe("items the reservation leaves alone", () => {
  it("does not touch stock for an item that is not one of our listings", async () => {
    const product = await sharedProduct(5);
    const order = orderOf(product.first, product.sku, { status: "paid", quantity: 1 });
    const [ours] = order.items;
    if (!ours) {
      throw new Error("item");
    }
    const foreign = { ...order, items: [{ ...ours, externalListingId: "NOT-OURS" }] };
    await sell(product.first, foreign);
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 0 });
  });

  it("never touches items sold before reservations existed", async () => {
    const product = await sharedProduct(5);
    const order = orderOf(product.first, product.sku, { status: "pending", quantity: 1 });
    const result = await sell(product.first, order);
    await database
      .update(orderItems)
      .set({ stockState: "untracked" })
      .where(eq(orderItems.orderId, result.orderId));
    await sell(product.first, { ...order, status: "paid" });
    await sell(product.first, { ...order, status: "shipped" });
    await sell(product.first, { ...order, status: "cancelled" });
    expect(await shelfOf(product.productId)).toEqual({ stock: 5, reserved: 0 });
    const [row] = await database
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, result.orderId));
    expect(row?.status).toBe("cancelled");
  });
});
