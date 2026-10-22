import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { storeConnections, suppliers, tenantProfile } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testStoreInput,
} from "../testing/fixtures.ts";
import { listStoreCatalog } from "./store-catalog.ts";
import { assignStoreSupplier } from "./store-suppliers.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
const PAGE = { page: 1, pageSize: 24 };
const FILTERS = { sort: "title" as const };
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let supplierX: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let supplierY: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let starter: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let paused: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let pausedStore = "";
let storeOne = "";
let storeTwo = "";
let orphanStore = "";
let foreignStore = "";

function tenant(index: number): string {
  const id = tenants.ids[index];
  if (id === undefined) throw new Error(`tenant ${index} não criado`);
  return id;
}

async function addStore(tenantId: string, shopId: string, supplierId: string | null) {
  const { id } = await upsertStoreConnection(database, testStoreInput(tenantId, shopId));
  if (supplierId !== null) {
    await assignStoreSupplier(database, { tenantId, storeConnectionId: id, supplierId });
  }
  return id;
}

function productIds(catalog: Awaited<ReturnType<typeof listStoreCatalog>>): string[] {
  return catalog.products.items.map((product) => product.id);
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 7);
  const suffix = tenant(0);
  supplierX = await createTestSupplierProduct(database, {
    sku: `SCX-${suffix}`,
    title: "Produto do fornecedor X",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  supplierY = await createTestSupplierProduct(database, {
    sku: `SCY-${suffix}`,
    title: "Produto do fornecedor Y",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  starter = await createTestSupplierProduct(database, {
    sku: `SCS-${suffix}`,
    title: "Produto do fornecedor inicial",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  paused = await createTestSupplierProduct(database, {
    sku: `SCP-${suffix}`,
    title: "Produto do fornecedor pausado",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  // Tenant 0: two stores (X then Y). Tenant 1: only a disconnected store. Tenant 2: nothing.
  // Tenant 3: a store without a supplier, and a starter supplier. Tenant 4: another account.
  storeOne = await addStore(tenant(0), `sc-one-${suffix}`, supplierX.supplierId);
  storeTwo = await addStore(tenant(0), `sc-two-${suffix}`, supplierY.supplierId);
  const gone = await addStore(tenant(1), `sc-gone-${suffix}`, supplierX.supplierId);
  await database
    .update(storeConnections)
    .set({ status: "disconnected" })
    .where(eq(storeConnections.id, gone));
  orphanStore = await addStore(tenant(3), `sc-orphan-${suffix}`, null);
  foreignStore = await addStore(tenant(4), `sc-foreign-${suffix}`, supplierY.supplierId);
  // Tenant 5: a store whose supplier the platform later deactivated. Tenant 6: no store, and
  // a starter supplier that is deactivated.
  pausedStore = await addStore(tenant(5), `sc-paused-${suffix}`, paused.supplierId);
  await database.insert(tenantProfile).values([
    { tenantId: tenant(1), starterSupplierId: starter.supplierId },
    { tenantId: tenant(3), starterSupplierId: starter.supplierId },
    { tenantId: tenant(6), starterSupplierId: paused.supplierId },
  ]);
  await database
    .update(suppliers)
    .set({ active: false })
    .where(eq(suppliers.id, paused.supplierId));
});

afterAll(async () => {
  await tenants.cleanup();
  await supplierX.cleanup();
  await supplierY.cleanup();
  await starter.cleanup();
  await paused.cleanup();
  await database.$client.end();
});

// MVP function 1: each store sells exactly one supplier, and the catalog follows the store.
describe("store catalog", () => {
  it("shows only X in store 1 and only Y in store 2", async () => {
    const first = await listStoreCatalog(database, tenant(0), { filters: FILTERS }, PAGE);
    expect(first.scope).toEqual({
      kind: "store",
      storeId: storeOne,
      supplierId: supplierX.supplierId,
    });
    expect(productIds(first)).toEqual([supplierX.productId]);
    const second = await listStoreCatalog(
      database,
      tenant(0),
      { storeId: storeTwo, filters: FILTERS },
      PAGE,
    );
    expect(second.supplier?.id).toBe(supplierY.supplierId);
    expect(productIds(second)).toEqual([supplierY.productId]);
  });

  it("ignores another account's store id and reveals nothing of it", async () => {
    const catalog = await listStoreCatalog(
      database,
      tenant(0),
      { storeId: foreignStore, filters: FILTERS },
      PAGE,
    );
    expect(catalog.scope.storeId).toBe(storeOne);
    expect(catalog.stores.map((store) => store.id)).toEqual([storeOne, storeTwo]);
    expect(productIds(catalog)).toEqual([supplierX.productId]);
  });

  it("does not count a disconnected store and shows the starter supplier", async () => {
    const catalog = await listStoreCatalog(database, tenant(1), { filters: FILTERS }, PAGE);
    expect(catalog.stores).toEqual([]);
    expect(catalog.scope).toEqual({
      kind: "starter",
      storeId: null,
      supplierId: starter.supplierId,
    });
    expect(productIds(catalog)).toEqual([starter.productId]);
  });

  it("is empty with no store and no starter supplier", async () => {
    const catalog = await listStoreCatalog(database, tenant(2), { filters: FILTERS }, PAGE);
    expect(catalog.supplier).toBeNull();
    expect(catalog.products.total).toBe(0);
    expect(catalog.categories).toEqual([]);
  });

  it("keeps a store without a supplier empty, never the starter or another supplier", async () => {
    const catalog = await listStoreCatalog(
      database,
      tenant(3),
      { storeId: orphanStore, filters: FILTERS },
      PAGE,
    );
    expect(catalog.scope).toEqual({ kind: "store", storeId: orphanStore, supplierId: null });
    expect(catalog.supplier).toBeNull();
    expect(catalog.products.total).toBe(0);
    expect(catalog.products.items).toEqual([]);
  });

  it("searches only inside the store's supplier", async () => {
    const catalog = await listStoreCatalog(
      database,
      tenant(0),
      { storeId: storeOne, filters: { ...FILTERS, search: "fornecedor Y" } },
      PAGE,
    );
    expect(catalog.products.total).toBe(0);
  });
  // Review finding: a deactivated supplier is never shown as the catalog's supplier.
  it("says the store's supplier is paused instead of naming it as the catalog's", async () => {
    const catalog = await listStoreCatalog(
      database,
      tenant(5),
      { storeId: pausedStore, filters: FILTERS },
      PAGE,
    );
    expect(catalog.supplier).toBeNull();
    expect(catalog.pausedSupplier?.id).toBe(paused.supplierId);
    expect(catalog.products.total).toBe(0);
  });

  it("treats a deactivated starter supplier as no starter supplier", async () => {
    const catalog = await listStoreCatalog(database, tenant(6), { filters: FILTERS }, PAGE);
    expect(catalog.scope).toEqual({ kind: "starter", storeId: null, supplierId: null });
    expect(catalog.supplier).toBeNull();
    expect(catalog.products.total).toBe(0);
  });
});
