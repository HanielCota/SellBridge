import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolvePeriod } from "@sellbridge/shared/period-range";
import { listingTargets, orders } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";
import { getStoreActivity, getStoreLastSyncs } from "./store-activity.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let storeB = "";
let productId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `shop-a-${tenantA}`))).id;
  storeB = (await upsertStoreConnection(database, testStoreInput(tenantB, `shop-b-${tenantB}`))).id;
  catalog = await createTestSupplierProduct(database, {
    sku: "ISO-1",
    title: "Produto isolamento",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  productId = catalog.productId;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("store activity", () => {
  it("counts live and failed listings per store, scoped to the tenant", async () => {
    const created = await createListingWithTargets(
      database,
      tenantA,
      { supplierProductId: productId, title: "Atividade", description: "", priceCents: 2500 },
      [storeA],
    );
    const [targetId = ""] = created.targetIds;
    await database
      .update(listingTargets)
      .set({ status: "published" })
      .where(eq(listingTargets.id, targetId));
    const activity = await getStoreActivity(database, tenantA, [storeA, storeB]);
    expect(activity.get(storeA)?.liveListings).toBeGreaterThanOrEqual(1);
    expect(activity.get(storeB)).toEqual({
      liveListings: 0,
      failedListings: 0,
      publishingListings: 0,
      orders: 0,
      revenueCents: 0,
      lastSyncedAt: null,
    });
  });

  it("counts queued listings apart from the live ones", async () => {
    const created = await createListingWithTargets(
      database,
      tenantB,
      { supplierProductId: productId, title: "Na fila", description: "", priceCents: 2500 },
      [storeB],
    );
    const activity = await getStoreActivity(database, tenantB, [storeB]);
    expect(activity.get(storeB)).toMatchObject({ liveListings: 0, publishingListings: 1 });
    await database.delete(listingTargets).where(eq(listingTargets.id, created.targetIds[0] ?? ""));
  });

  it("dates the store's last sync by its most recently synced listing", async () => {
    // The store's listing from the test above, synced 12 minutes ago.
    const syncedAt = new Date(Date.now() - 12 * 60_000);
    await database
      .update(listingTargets)
      .set({ status: "published", syncedAt })
      .where(eq(listingTargets.storeConnectionId, storeA));
    const activity = await getStoreActivity(database, tenantA, [storeA]);
    expect(activity.get(storeA)?.lastSyncedAt?.getTime()).toBeGreaterThanOrEqual(
      syncedAt.getTime(),
    );
    const lastSyncs = await getStoreLastSyncs(database, tenantA, [storeA, storeB]);
    expect(lastSyncs.get(storeA)).toEqual(activity.get(storeA)?.lastSyncedAt);
    // Another tenant's store never reads this tenant's listings.
    expect(lastSyncs.has(storeB)).toBe(false);
  });

  // Regression: the store card counted 30 x 24 h back from now while the dashboard's "30 dias"
  // starts at midnight (Brazil) 29 days ago, so the two disagreed for the same store.
  it("counts sales from the start of the dashboard's 30-day window, not 30 x 24 h", async () => {
    const windowStart = resolvePeriod({ period: "30d" }, new Date()).from;
    const sale = (externalOrderId: string, orderedAt: Date) => ({
      tenantId: tenantB,
      storeConnectionId: storeB,
      externalOrderId,
      status: "paid" as const,
      totalCents: 1000,
      orderedAt,
    });
    await database
      .insert(orders)
      .values([
        sale("WINDOW-START", windowStart),
        sale("BEFORE-WINDOW", new Date(windowStart.getTime() - 1)),
      ]);
    const activity = await getStoreActivity(database, tenantB, [storeB]);
    expect(activity.get(storeB)).toMatchObject({ orders: 1, revenueCents: 1000 });
  });
});
