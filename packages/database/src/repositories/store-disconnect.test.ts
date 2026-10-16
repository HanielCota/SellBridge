import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets } from "./listings.ts";
import {
  findLiveStoreTargets,
  findStoreAccessForPause,
  markStoreTargetsPaused,
} from "./store-disconnect.ts";
import { disconnectStore, upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let tenantA = "";
let tenantB = "";
let storeA = "";
let targetId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  ({ tenantA, tenantB } = tenants);
  storeA = (await upsertStoreConnection(database, testStoreInput(tenantA, `shop-off-${tenantA}`)))
    .id;
  catalog = await createTestSupplierProduct(database, {
    sku: "OFF-1",
    title: "Produto desconexão",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  const created = await createListingWithTargets(
    database,
    tenantA,
    {
      supplierProductId: catalog.productId,
      title: "Desconexão",
      description: "",
      priceCents: 2790,
    },
    [storeA],
  );
  targetId = created.targetIds[0] ?? "";
  await database
    .update(listingTargets)
    .set({ status: "published", externalId: "MOCK-OFF-1" })
    .where(eq(listingTargets.id, targetId));
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("pausing a store's listings before disconnecting it", () => {
  it("reads the store's access and its live listings, only for its own tenant", async () => {
    const store = { tenantId: tenantA, storeConnectionId: storeA };
    expect(await findStoreAccessForPause(database, store)).toEqual({
      marketplace: "mock",
      externalShopId: `shop-off-${tenantA}`,
      accessTokenEnc: "enc-access",
    });
    expect(await findLiveStoreTargets(database, store)).toEqual([
      { targetId, externalId: "MOCK-OFF-1", priceCents: 2790 },
    ]);
    const stranger = { tenantId: tenantB, storeConnectionId: storeA };
    expect(await findStoreAccessForPause(database, stranger)).toBeNull();
    expect(await findLiveStoreTargets(database, stranger)).toEqual([]);
  });

  it("marks the listings paused with zero stock, never another tenant's", async () => {
    expect(await markStoreTargetsPaused(database, tenantB, [targetId])).toBe(0);
    expect(await markStoreTargetsPaused(database, tenantA, [targetId])).toBe(1);
    const [row] = await database
      .select({ status: listingTargets.status, syncedStock: listingTargets.syncedStock })
      .from(listingTargets)
      .where(eq(listingTargets.id, targetId));
    expect(row).toEqual({ status: "paused", syncedStock: 0 });
  });

  it("finds no access once the store is disconnected", async () => {
    await disconnectStore(database, tenantA, storeA);
    expect(
      await findStoreAccessForPause(database, { tenantId: tenantA, storeConnectionId: storeA }),
    ).toBeNull();
  });
});
