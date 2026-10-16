import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { listings, listingTargets, storeConnections } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { billingUsage } from "./billing.ts";
import { resetListingErrorsForRetry } from "./listing-overview.ts";
import { createListingWithTargets } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const FREE_LISTINGS = 25;

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let products: Awaited<ReturnType<typeof createTestSupplierProduct>>[];
let storeIds: string[];

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  products = await Promise.all(
    ["QUOTA-1", "QUOTA-2"].map(async (sku) =>
      createTestSupplierProduct(database, {
        sku,
        title: "Cota",
        costCents: 1000,
        suggestedPriceCents: 2500,
      }),
    ),
  );
  const stores = await Promise.all(
    ["quota-a", "quota-b"].map(async (shop) =>
      upsertStoreConnection(database, testStoreInput(tenants.tenantA, shop)),
    ),
  );
  storeIds = stores.map((store) => store.id);
});

afterAll(async () => {
  await tenants.cleanup();
  await Promise.all(products.map(async (product) => product.cleanup()));
  await database.$client.end();
});

function listingInput(productId: string) {
  return {
    supplierProductId: productId,
    title: "Cota",
    description: "",
    priceCents: 2500,
    billingEnabled: true,
  };
}

// Regression (item 16, N7): the quota counted every listing row, failed ones included, and one
// listing published in two stores used a single slot.
describe("listing quota by destination store", () => {
  it("ignores listings without a live publication", async () => {
    await database.insert(listings).values(
      Array.from({ length: 30 }, () => ({
        tenantId: tenants.tenantA,
        supplierProductId: products[0]?.productId ?? "",
        title: "Antigo",
        description: "",
        priceCents: 2500,
      })),
    );
    expect((await billingUsage(database, tenants.tenantA)).listings).toBe(0);
  });

  it("uses one slot per destination store", async () => {
    await createListingWithTargets(
      database,
      tenants.tenantA,
      listingInput(products[0]?.productId ?? ""),
      storeIds,
    );
    expect((await billingUsage(database, tenants.tenantA)).listings).toBe(2);
  });

  it("frees the slot of a failed publication, never of a disconnected store", async () => {
    const [first, second] = storeIds;
    if (first === undefined || second === undefined) throw new Error("missing fixture stores");
    await database
      .update(listingTargets)
      .set({ status: "error" })
      .where(eq(listingTargets.storeConnectionId, first));
    expect((await billingUsage(database, tenants.tenantA)).listings).toBe(1);
    // Review of item 16: freeing the slots on disconnect let a reconnect pass the plan.
    await database
      .update(storeConnections)
      .set({ status: "disconnected" })
      .where(eq(storeConnections.id, second));
    expect((await billingUsage(database, tenants.tenantA)).listings).toBe(1);
    await database
      .update(storeConnections)
      .set({ status: "connected" })
      .where(eq(storeConnections.id, second));
  });

  it("refuses a listing whose stores would pass the plan", async () => {
    const [first] = storeIds;
    if (first === undefined) throw new Error("missing fixture stores");
    const fillers = await database
      .insert(listings)
      .values(
        Array.from({ length: FREE_LISTINGS - 2 }, () => ({
          tenantId: tenants.tenantA,
          supplierProductId: products[0]?.productId ?? "",
          title: "Enchimento",
          description: "",
          priceCents: 2500,
        })),
      )
      .returning({ id: listings.id });
    await database.insert(listingTargets).values(
      fillers.map((filler) => ({
        tenantId: tenants.tenantA,
        listingId: filler.id,
        storeConnectionId: first,
        status: "published" as const,
        idempotencyKey: crypto.randomUUID(),
      })),
    );
    // 23 filler + 1 live target = 24 of 25: a listing for two stores does not fit.
    await expect(
      createListingWithTargets(
        database,
        tenants.tenantA,
        listingInput(products[1]?.productId ?? ""),
        storeIds,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("never counts another tenant's publications", async () => {
    expect((await billingUsage(database, tenants.tenantB)).listings).toBe(0);
  });

  // Review of item 16: "Reprocessar" moved failed targets back to pending past the plan.
  it("refuses to retry failed publications that no longer fit the plan", async () => {
    const [failed] = await database
      .select({ listingId: listingTargets.listingId })
      .from(listingTargets)
      .where(and(eq(listingTargets.tenantId, tenants.tenantA), eq(listingTargets.status, "error")));
    if (failed === undefined) throw new Error("missing failed target");
    // 23 filler + 1 live = 24 of 25 after the previous test; take the last slot.
    await createListingWithTargets(
      database,
      tenants.tenantA,
      listingInput(products[1]?.productId ?? ""),
      [storeIds[0] ?? ""],
    );
    await expect(
      resetListingErrorsForRetry(database, tenants.tenantA, [failed.listingId], {
        billingEnabled: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      resetListingErrorsForRetry(database, tenants.tenantA, [failed.listingId], {
        billingEnabled: false,
      }),
    ).resolves.toHaveLength(1);
  });
});
