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
import { upsertStoreConnection } from "./stores.ts";
import { getStoreActivity } from "./store-activity.ts";

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
      orders: 0,
      revenueCents: 0,
    });
  });
});
