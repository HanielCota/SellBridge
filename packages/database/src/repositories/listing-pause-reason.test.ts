import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { resumeStoreListingsPausedByDisconnection, setListingsPaused } from "./listing-actions.ts";
import {
  findListingsPausedByDisconnection,
  findPausedListings,
  holdListingsBelowPriceFloor,
} from "./listing-resume.ts";
import { getStoreActivity } from "./store-activity.ts";
import { markStoreTargetsPaused } from "./store-disconnect.ts";
import { createListingWithTargets, markTargetPublished } from "./listings.ts";
import { stopProductPublications } from "./stop-product-publications.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let secondCatalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantId = "";
let storeId = "";
let otherStoreId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  tenantId = tenants.tenantA;
  storeId = (
    await upsertStoreConnection(database, testStoreInput(tenantId, `shop-why-${tenantId}`))
  ).id;
  otherStoreId = (
    await upsertStoreConnection(database, testStoreInput(tenantId, `shop-why-2-${tenantId}`))
  ).id;
  catalog = await createTestSupplierProduct(database, {
    sku: "WHY-1",
    title: "Produto motivo",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  secondCatalog = await createTestSupplierProduct(database, {
    sku: "WHY-2",
    title: "Produto motivo 2",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await secondCatalog.cleanup();
  await database.$client.end();
});

async function listing(
  status: "published" | "pending",
  store = storeId,
  productId = catalog.productId,
) {
  const created = await createListingWithTargets(
    database,
    tenantId,
    {
      supplierProductId: productId,
      title: "Motivo",
      description: "",
      priceCents: 2790,
    },
    [store],
  );
  const targetId = created.targetIds[0] ?? "";
  await database
    .update(listingTargets)
    .set({ status, externalId: status === "published" ? `MOCK-${targetId}` : null })
    .where(eq(listingTargets.id, targetId));
  return { listingId: created.listingId, targetId };
}

async function stateOf(targetId: string) {
  const [row] = await database
    .select({ status: listingTargets.status, pauseReason: listingTargets.pauseReason })
    .from(listingTargets)
    .where(eq(listingTargets.id, targetId));
  return row;
}

async function removeListing(targetId: string) {
  await database.delete(listingTargets).where(eq(listingTargets.id, targetId));
}

describe("the reason a publication is paused", () => {
  it("records the reseller's own pause and clears it on resume", async () => {
    const { listingId, targetId } = await listing("published");

    await setListingsPaused(database, tenantId, [listingId], true);
    const paused = await stateOf(targetId);
    await setListingsPaused(database, tenantId, [listingId], false);
    const resumed = await stateOf(targetId);

    expect(paused).toEqual({ status: "paused", pauseReason: "seller" });
    expect(resumed).toEqual({ status: "published", pauseReason: null });
    await removeListing(targetId);
  });

  it("records an archived product, also for a publication still on its way", async () => {
    const live = await listing("published");
    const queued = await listing("pending", otherStoreId);

    await stopProductPublications(database, tenantId, catalog.productId);
    await markTargetPublished(database, queued.targetId, {
      externalId: "MOCK-LATE",
      externalUrl: null,
    });

    expect(await stateOf(live.targetId)).toEqual({
      status: "paused",
      pauseReason: "product_archived",
    });
    expect(await stateOf(queued.targetId)).toEqual({
      status: "paused",
      pauseReason: "product_archived",
    });
    await removeListing(live.targetId);
    await removeListing(queued.targetId);
  });
});

describe("resuming after a reconnection", () => {
  it("offers and resumes only what the disconnection paused, never the reseller's own pause", async () => {
    const disconnected = await listing("published");
    const ownPause = await listing("published", storeId, secondCatalog.productId);
    await setListingsPaused(database, tenantId, [ownPause.listingId], true);
    await markStoreTargetsPaused(database, tenantId, [disconnected.targetId]);

    const offered = await findListingsPausedByDisconnection(database, tenantId, storeId);
    const activity = (await getStoreActivity(database, tenantId, [storeId])).get(storeId);
    const resumed = await resumeStoreListingsPausedByDisconnection(database, tenantId, storeId, [
      disconnected.listingId,
      ownPause.listingId,
    ]);

    expect(offered).toEqual([
      expect.objectContaining({
        listingId: disconnected.listingId,
        priceCents: 2790,
        costCents: 1000,
        storeIds: [storeId],
        marketplaces: ["mock"],
      }),
    ]);
    expect(activity?.pausedByDisconnection).toBe(1);
    expect(resumed).toBe(1);
    expect(await stateOf(disconnected.targetId)).toEqual({
      status: "published",
      pauseReason: null,
    });
    expect(await stateOf(ownPause.targetId)).toEqual({ status: "paused", pauseReason: "seller" });
    await removeListing(disconnected.targetId);
    await removeListing(ownPause.targetId);
  });

  it("keeps a listing that would lose money paused, with that reason", async () => {
    const losing = await listing("published");
    await markStoreTargetsPaused(database, tenantId, [losing.targetId]);

    const held = await holdListingsBelowPriceFloor(database, tenantId, {
      listingIds: [losing.listingId],
      storeConnectionId: storeId,
    });
    const resumed = await resumeStoreListingsPausedByDisconnection(database, tenantId, storeId, [
      losing.listingId,
    ]);

    expect(held).toBe(1);
    expect(resumed).toBe(0);
    expect(await stateOf(losing.targetId)).toEqual({
      status: "paused",
      pauseReason: "price_below_floor",
    });
    expect(await findPausedListings(database, tenantId, [losing.listingId])).toHaveLength(1);
    await removeListing(losing.targetId);
  });
});
