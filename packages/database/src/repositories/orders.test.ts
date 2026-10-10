import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets, orderItems, orders, supplierProducts } from "../schema/index.ts";
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
    expect(second).toEqual({ status: "updated", orderId: first.orderId });

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
