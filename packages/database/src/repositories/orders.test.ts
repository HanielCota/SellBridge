import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiEvents,
  listingTargets,
  orderItems,
  orders,
  supplierProducts,
} from "../schema/index.ts";
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
  markTargetSynced,
} from "./listings.ts";
import { upsertMarketplaceOrder } from "./orders.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let productId = "";
let storeA = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  catalog = await createTestSupplierProduct(database, {
    sku: "F4",
    title: "Produto F4",
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 8,
  });
  productId = catalog.productId;
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `shop-${tenantA}`))).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("marketplace orders and sync", () => {
  it("upserts orders idempotently and links our listing and cost", async () => {
    const created = await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio F4",
        description: "Descrição",
        priceCents: 3990,
      },
      [storeA],
    );
    const [targetId] = created.targetIds;
    if (!targetId) {
      throw new Error("destino");
    }
    await markTargetPublished(database, targetId, { externalId: "EXT-F4", externalUrl: null });

    const incoming = {
      externalOrderId: `ORD-${randomUUID()}`,
      status: "paid" as const,
      totalCents: 7980,
      marketplaceFeeCents: 1100,
      buyerName: "Comprador",
      orderedAt: new Date(),
      items: [
        { externalListingId: "EXT-F4", title: "Anúncio F4", quantity: 2, unitPriceCents: 3990 },
        {
          externalListingId: "OUTRO",
          title: "Item de outro sistema",
          quantity: 1,
          unitPriceCents: 0,
        },
      ],
    };
    const first = await upsertMarketplaceOrder(database, tenantA, storeA, incoming);
    const second = await upsertMarketplaceOrder(database, tenantA, storeA, {
      ...incoming,
      status: "cancelled",
    });
    expect(first.status).toBe("created");
    // The cancel lets go of the one item of ours that was holding stock.
    expect(second).toEqual({ status: "updated", orderId: first.orderId, stockMoves: 1 });

    const order = await database.query.orders.findFirst({ where: eq(orders.id, first.orderId) });
    expect(order?.status).toBe("cancelled");
    const items = await database
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, first.orderId));
    expect(items).toHaveLength(2);
    const ours = items.find((item) => item.title === "Anúncio F4");
    expect(ours).toMatchObject({ listingTargetId: targetId, unitCostCents: 1500 });
    expect(items.find((item) => item.title !== "Anúncio F4")?.unitCostCents).toBe(0);

    await expect(upsertMarketplaceOrder(database, tenantB, storeA, incoming)).rejects.toThrow(
      "outro tenant",
    );
  });

  it("records order.created and order.status_changed only when the status changes", async () => {
    const externalOrderId = `ORD-${randomUUID()}`;
    const incoming = {
      externalOrderId,
      status: "paid" as const,
      totalCents: 5000,
      marketplaceFeeCents: 500,
      buyerName: null,
      orderedAt: new Date("2026-02-01T10:00:00Z"),
      items: [],
    };
    const eventsOfOrder = async () =>
      database
        .select({ type: apiEvents.type, data: apiEvents.data })
        .from(apiEvents)
        .where(
          and(
            eq(apiEvents.tenantId, tenantA),
            sql`${apiEvents.data} ->> 'externalOrderId' = ${externalOrderId}`,
          ),
        )
        .orderBy(apiEvents.sequence);

    const { orderId } = await upsertMarketplaceOrder(database, tenantA, storeA, incoming);
    await upsertMarketplaceOrder(database, tenantA, storeA, { ...incoming, totalCents: 5100 });
    await upsertMarketplaceOrder(database, tenantA, storeA, { ...incoming, status: "shipped" });

    const events = await eventsOfOrder();
    expect(events.map((event) => event.type)).toEqual(["order.created", "order.status_changed"]);
    expect(events[0]?.data).toEqual({
      orderId,
      externalOrderId,
      storeId: storeA,
      status: "paid",
      previousStatus: null,
      totalCents: 5000,
      orderedAt: "2026-02-01T10:00:00.000Z",
    });
    expect(events[1]?.data).toMatchObject({ status: "shipped", previousStatus: "paid" });
  });

  it("dates the delivery on the first sync that sees it", async () => {
    const orderedAt = new Date("2026-01-05T12:00:00Z");
    const incoming = {
      externalOrderId: `ORD-${randomUUID()}`,
      status: "shipped" as const,
      totalCents: 3990,
      marketplaceFeeCents: 0,
      buyerName: null,
      orderedAt,
      items: [],
    };
    const deliveredAt = async (orderId: string) =>
      (await database.query.orders.findFirst({ where: eq(orders.id, orderId) }))?.deliveredAt;

    const { orderId } = await upsertMarketplaceOrder(database, tenantA, storeA, incoming);
    expect(await deliveredAt(orderId)).toBeNull();

    const before = new Date();
    await upsertMarketplaceOrder(database, tenantA, storeA, { ...incoming, status: "delivered" });
    const first = await deliveredAt(orderId);
    expect(first?.getTime()).toBeGreaterThanOrEqual(before.getTime());

    await upsertMarketplaceOrder(database, tenantA, storeA, { ...incoming, status: "delivered" });
    expect(await deliveredAt(orderId)).toEqual(first);

    const late = await upsertMarketplaceOrder(database, tenantA, storeA, {
      ...incoming,
      externalOrderId: `ORD-${randomUUID()}`,
      status: "delivered",
    });
    expect(await deliveredAt(late.orderId)).toEqual(orderedAt);
  });

  it("lists published listings whose stock or price changed", async () => {
    const created = await createListingWithTargets(
      database,
      tenantA,
      {
        supplierProductId: productId,
        title: "Anúncio sync",
        description: "Descrição",
        priceCents: 4500,
      },
      [storeA],
    );
    const [targetId] = created.targetIds;
    if (!targetId) {
      throw new Error("destino");
    }
    await markTargetPublished(database, targetId, { externalId: "EXT-SYNC", externalUrl: null });
    expect(
      (await findTargetsNeedingSync(database, 500)).map((target) => target.targetId),
    ).toContain(targetId);

    await markTargetSynced(database, targetId, { stock: 8, priceCents: 4500 });
    expect(
      (await findTargetsNeedingSync(database, 500)).map((target) => target.targetId),
    ).not.toContain(targetId);

    await database
      .update(supplierProducts)
      .set({ stock: 3 })
      .where(eq(supplierProducts.id, productId));
    const pending = (await findTargetsNeedingSync(database, 500)).find(
      (target) => target.targetId === targetId,
    );
    expect(pending).toMatchObject({ stock: 3, priceCents: 4500, externalId: "EXT-SYNC" });
    await database
      .update(listingTargets)
      .set({ status: "error" })
      .where(eq(listingTargets.id, targetId));
    expect(
      (await findTargetsNeedingSync(database, 500)).map((target) => target.targetId),
    ).not.toContain(targetId);
  });
});
