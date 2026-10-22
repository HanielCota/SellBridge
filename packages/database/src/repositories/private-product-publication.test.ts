import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets, supplierProducts } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { resetListingErrorsForRetry, setListingsPaused } from "./listing-actions.ts";
import { findTargetsNeedingSync } from "./listing-sync.ts";
import { createListingWithTargets, markTargetPublished } from "./listings.ts";
import { archiveSellerProduct, ensureSellerCatalog } from "./seller-catalog.ts";
import { assertStoresSellSupplier, changeStoreSupplier } from "./store-suppliers.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let external: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let replacement: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let sourceId = "";
let productId = "";
let draftId = "";
let storeId = "";
let ownStoreId = "";
let foreignStoreId = "";
let listingId = "";
let targetId = "";

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  external = await createTestSupplierProduct(database, {
    sku: randomUUID(),
    title: "External product",
    costCents: 1000,
    suggestedPriceCents: 3000,
  });
  replacement = await createTestSupplierProduct(database, {
    sku: randomUUID(),
    title: "Replacement supplier product",
    costCents: 1000,
    suggestedPriceCents: 3000,
  });
  const source = await ensureSellerCatalog(database, tenants.tenantA);
  sourceId = source.id;
  productId = randomUUID();
  draftId = randomUUID();
  await database.insert(supplierProducts).values(
    [productId, draftId].map((id) => ({
      id,
      supplierId: source.id,
      sku: id,
      title: "Private publishable product",
      description: "A private product with a complete description.",
      costCents: 1000,
      suggestedPriceCents: 3000,
      stock: 10,
      active: true,
      reviewStatus: id === productId ? ("approved" as const) : ("draft" as const),
    })),
  );
  storeId = (
    await upsertStoreConnection(database, {
      ...testStoreInput(tenants.tenantA, randomUUID()),
      supplierId: external.supplierId,
    })
  ).id;
  ownStoreId = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantA, randomUUID()))
  ).id;
  foreignStoreId = (
    await upsertStoreConnection(database, testStoreInput(tenants.tenantB, randomUUID()))
  ).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await external.cleanup();
  await replacement.cleanup();
  await database.$client.end();
});

function draft(id = productId) {
  return {
    supplierProductId: id,
    title: "Private publishable product",
    description: "A private product with a complete description.",
    priceCents: 3000,
  };
}

describe("private product publication", () => {
  // MVP (coordinator decision, 2026-10-22): a new publication of an own product is refused,
  // even by a direct call; listings created before the rule are kept (created below directly).
  it("refuses a new publication of an owned product, even in its owner's stores", async () => {
    await expect(
      assertStoresSellSupplier(database, tenants.tenantA, [storeId, ownStoreId], sourceId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const listing = await createListingWithTargets(database, tenants.tenantA, draft(), [
      storeId,
      ownStoreId,
    ]);
    listingId = listing.listingId;
    expect(listing.targetIds).toHaveLength(2);
    const target = await database.query.listingTargets.findFirst({
      where: eq(listingTargets.storeConnectionId, storeId),
    });
    if (target === undefined) throw new Error("Missing private publication");
    targetId = target.id;
  });

  it("refuses foreign products, foreign stores and unfinished drafts at the persistence boundary", async () => {
    await expect(
      assertStoresSellSupplier(database, tenants.tenantB, [foreignStoreId], sourceId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createListingWithTargets(database, tenants.tenantB, draft(), [foreignStoreId]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createListingWithTargets(database, tenants.tenantA, draft(), [foreignStoreId]),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createListingWithTargets(database, tenants.tenantA, draft(draftId), [storeId]),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("resumes owned publications and preserves them when a store's external supplier changes", async () => {
    await markTargetPublished(database, targetId, { externalId: randomUUID(), externalUrl: null });
    expect(await setListingsPaused(database, tenants.tenantA, [listingId], true)).toBe(1);
    expect(await setListingsPaused(database, tenants.tenantA, [listingId], false)).toBe(1);
    expect(
      await changeStoreSupplier(database, {
        tenantId: tenants.tenantA,
        storeConnectionId: storeId,
        supplierId: replacement.supplierId,
      }),
    ).toEqual({ livePaused: 0, queuedStopped: 0 });
    expect(
      (await database.query.listingTargets.findFirst({ where: eq(listingTargets.id, targetId) }))
        ?.status,
    ).toBe("published");
  });

  it("clears a stopped queue only after an explicit retry of a ready product", async () => {
    await archiveSellerProduct(database, tenants.tenantA, productId);
    await expect(
      resetListingErrorsForRetry(database, tenants.tenantA, [listingId], { billingEnabled: false }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await database
      .update(supplierProducts)
      .set({ active: true })
      .where(eq(supplierProducts.id, productId));
    const retried = await resetListingErrorsForRetry(database, tenants.tenantA, [listingId], {
      billingEnabled: false,
    });
    expect(retried).toHaveLength(1);
    const queued = await database.query.listingTargets.findFirst({
      where: eq(listingTargets.id, retried[0] ?? ""),
    });
    expect(queued).toMatchObject({ status: "pending", pauseRequested: false });
    expect(
      await database.query.listingTargets.findFirst({ where: eq(listingTargets.id, targetId) }),
    ).toMatchObject({ status: "paused", pauseRequested: true });
  });

  it("keeps stop intent in SQL stock sync even if a legacy writer records a live status", async () => {
    await database
      .update(listingTargets)
      .set({ status: "published" })
      .where(eq(listingTargets.id, targetId));
    const targets = await findTargetsNeedingSync(database, 100_000);
    expect(targets.find((target) => target.targetId === targetId)?.stock).toBe(0);
  });

  it("never replenishes a private source associated with another tenant", async () => {
    const foreignSource = await ensureSellerCatalog(database, tenants.tenantB);
    await database
      .update(listingTargets)
      .set({ pauseRequested: false })
      .where(eq(listingTargets.id, targetId));
    await database
      .update(supplierProducts)
      .set({ supplierId: foreignSource.id })
      .where(eq(supplierProducts.id, productId));
    try {
      const targets = await findTargetsNeedingSync(database, 100_000);
      expect(targets.find((target) => target.targetId === targetId)?.stock).toBe(0);
    } finally {
      await database
        .update(supplierProducts)
        .set({ supplierId: sourceId })
        .where(eq(supplierProducts.id, productId));
    }
  });
});
