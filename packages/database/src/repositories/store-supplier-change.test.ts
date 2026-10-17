import { randomUUID } from "node:crypto";
import { STORE_SUPPLIER_CHANGED_MESSAGE } from "@sellbridge/shared/store-supplier";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets, supplierProducts } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  publishTestProduct,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets } from "./listings.ts";
import { setListingsPaused } from "./listing-actions.ts";
import { changeStoreSupplier, previewStoreSupplierChange } from "./store-suppliers.ts";
import { consumeOAuthState, createOAuthState, upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
const catalogs: Awaited<ReturnType<typeof createTestSupplierProduct>>[] = [];
let tenantId = "";
let storeId = "";

async function product(label: string) {
  const catalog = await createTestSupplierProduct(database, {
    sku: `CHG-${label}-${randomUUID().slice(0, 8)}`,
    title: `Produto ${label}`,
    costCents: 1000,
    suggestedPriceCents: 2000,
    stock: 4,
  });
  catalogs.push(catalog);
  return catalog;
}

async function statusOf(targetId: string) {
  const [row] = await database
    .select({ status: listingTargets.status, errorReason: listingTargets.errorReason })
    .from(listingTargets)
    .where(eq(listingTargets.id, targetId));
  return row;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  const [first] = tenants.ids;
  if (first === undefined) {
    throw new Error("tenant não criado");
  }
  tenantId = first;
});

afterAll(async () => {
  await tenants.cleanup();
  for (const catalog of catalogs) {
    await catalog.cleanup();
  }
  await database.$client.end();
});

describe("changing the supplier of a shop", () => {
  it("previews, then pauses live listings and stops queued ones of the old supplier", async () => {
    const old = await product("antigo");
    const next = await product("novo");
    const store = await upsertStoreConnection(database, {
      ...testStoreInput(tenantId, `shop-chg-${tenantId}`),
      supplierId: old.supplierId,
    });
    storeId = store.id;
    const live = await publishTestProduct(database, old.productId, [{ tenantId, storeId }]);
    const liveTarget = live.get(tenantId) ?? "";
    const [secondProduct] = await database
      .insert(supplierProducts)
      .values({
        supplierId: old.supplierId,
        sku: `CHG-2-${randomUUID().slice(0, 8)}`,
        title: "Segundo produto",
        costCents: 1000,
        suggestedPriceCents: 2000,
        stock: 4,
      })
      .returning({ id: supplierProducts.id });
    const queued = await createListingWithTargets(
      database,
      tenantId,
      {
        supplierProductId: secondProduct?.id ?? "",
        title: "Fila",
        description: "Fila",
        priceCents: 3000,
      },
      [storeId],
    );
    const queuedTarget = queued.targetIds[0] ?? "";
    const input = { tenantId, storeConnectionId: storeId, supplierId: next.supplierId };

    expect(await previewStoreSupplierChange(database, input)).toEqual({
      livePaused: 1,
      queuedStopped: 1,
    });
    expect(await changeStoreSupplier(database, input)).toEqual({ livePaused: 1, queuedStopped: 1 });
    expect(await statusOf(liveTarget)).toMatchObject({ status: "paused" });
    expect(await statusOf(queuedTarget)).toEqual({
      status: "error",
      errorReason: STORE_SUPPLIER_CHANGED_MESSAGE,
    });
  });

  it("keeps the paused listings paused while the shop sells another supplier", async () => {
    const [target] = await database
      .select({ listingId: listingTargets.listingId })
      .from(listingTargets)
      .where(
        and(eq(listingTargets.status, "paused"), eq(listingTargets.storeConnectionId, storeId)),
      );
    if (target === undefined) {
      throw new Error("anúncio pausado não encontrado");
    }
    expect(await setListingsPaused(database, tenantId, [target.listingId], false)).toBe(0);
  });

  it("keeps the supplier of a shop when it is connected again", async () => {
    const other = await product("outro");
    const reconnected = await upsertStoreConnection(database, {
      ...testStoreInput(tenantId, `shop-chg-${tenantId}`),
      supplierId: other.supplierId,
    });
    expect(reconnected.id).toBe(storeId);
    expect(reconnected.supplierId).not.toBe(other.supplierId);
  });

  it("carries the picked supplier through the OAuth state", async () => {
    const picked = await product("oauth");
    await createOAuthState(database, {
      state: `state-${tenantId}`,
      tenantId,
      marketplace: "mock",
      codeVerifier: null,
      ttlMilliseconds: 60_000,
      supplierId: picked.supplierId,
    });
    expect(
      await consumeOAuthState(database, {
        state: `state-${tenantId}`,
        tenantId,
        marketplace: "mock",
      }),
    ).toEqual({ codeVerifier: null, supplierId: picked.supplierId });
  });
});
