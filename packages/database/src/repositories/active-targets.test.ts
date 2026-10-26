import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { countFailedListingTargets, getListingActivity } from "./active-targets.ts";
import { createListingWithTargets } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let targetId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  catalog = await createTestSupplierProduct(database, {
    sku: "ACTIVITY-1",
    title: "Activity test product",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  const store = await upsertStoreConnection(
    database,
    testStoreInput(tenants.tenantA, `activity-${tenants.tenantA}`),
  );
  const listing = await createListingWithTargets(
    database,
    tenants.tenantA,
    {
      supplierProductId: catalog.productId,
      title: "Activity test listing",
      description: "Test description",
      priceCents: 2500,
    },
    [store.id],
  );
  targetId = listing.targetIds[0] ?? "";
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

async function setTarget(values: Partial<typeof listingTargets.$inferInsert>) {
  await database
    .update(listingTargets)
    .set({ descriptionError: null, descriptionFailedAt: null, ...values })
    .where(and(eq(listingTargets.id, targetId), eq(listingTargets.tenantId, tenants.tenantA)));
}

describe("lightweight listing activity", () => {
  it("keeps pending and published flags distinct and isolates tenants", async () => {
    await setTarget({ status: "pending" });
    expect(await getListingActivity(database, tenants.tenantA)).toEqual({
      hasPublished: false,
      hasActive: true,
    });
    expect(await getListingActivity(database, tenants.tenantB)).toEqual({
      hasPublished: false,
      hasActive: false,
    });
    await setTarget({ status: "published" });
    expect(await getListingActivity(database, tenants.tenantA)).toEqual({
      hasPublished: true,
      hasActive: false,
    });
  });

  it("keeps polling recent description resends and stops after their window", async () => {
    await setTarget({
      status: "published",
      descriptionError: "Retry requested",
      descriptionFailedAt: new Date(),
    });
    expect((await getListingActivity(database, tenants.tenantA)).hasActive).toBe(true);
    await setTarget({
      descriptionError: "Retry expired",
      descriptionFailedAt: new Date(Date.now() - 6 * 60 * 1000),
    });
    expect((await getListingActivity(database, tenants.tenantA)).hasActive).toBe(false);
  });

  it("counts only failed targets of the requested tenant", async () => {
    await setTarget({ status: "error" });
    expect(await countFailedListingTargets(database, tenants.tenantA)).toBe(1);
    expect(await countFailedListingTargets(database, tenants.tenantB)).toBe(0);
    expect(await getListingActivity(database, tenants.tenantA)).toEqual({
      hasPublished: false,
      hasActive: false,
    });
    await setTarget({ status: "paused" });
    expect(await countFailedListingTargets(database, tenants.tenantA)).toBe(0);
  });
});
