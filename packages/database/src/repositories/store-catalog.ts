import {
  resolveCatalogScope,
  resolveSupplierFilter,
  type CatalogScope,
} from "@sellbridge/shared/catalog-scope";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { categories, supplierProducts, suppliers, tenantProfile } from "../schema/index.ts";
import { countRecentUnitsSold } from "./product-heat.ts";
import { productListable, publicSupplier } from "./sql/sellable.ts";
import { listStoreConnections, type StoreConnectionSummary } from "./stores.ts";
import {
  listSellableCatalog,
  type SellableCatalogFilters,
  type SellableCatalogProduct,
} from "./suppliers.ts";

/** A catalog product with its units sold in the heat window across SellBridge. */
export interface StoreCatalogProduct extends SellableCatalogProduct {
  recentUnitsSold: number;
}

interface CatalogSupplier {
  id: string;
  name: string;
}

/** The catalog of one store's suppliers (MVP function 1): what the reseller page reads. */
export interface StoreCatalog {
  scope: CatalogScope;
  /** The scope's active suppliers, oldest link first; empty when none can be sold. */
  suppliers: CatalogSupplier[];
  /** The scope's suppliers the platform deactivated: their products are left out. */
  pausedSuppliers: CatalogSupplier[];
  /** The supplier the catalog is filtered by, one of `suppliers`; null shows them all. */
  supplierFilter: string | null;
  /** The account's stores that still count (not disconnected), for the store picker. */
  stores: StoreConnectionSummary[];
  products: Paginated<StoreCatalogProduct>;
  categories: { name: string; slug: string }[];
}

export interface StoreCatalogRequest {
  /** The store picked in the URL; ignored unless it is one of the account's own stores. */
  storeId?: string | undefined;
  /** The supplier picked in the URL; ignored unless the chosen store sells it. */
  supplierId?: string | undefined;
  filters: Omit<SellableCatalogFilters, "supplierId" | "supplierIds">;
}

/** The supplier chosen in the onboarding; only an active public supplier counts. */
async function findStarterSupplierId(database: Database, tenantId: string): Promise<string | null> {
  const [row] = await database
    .select({ supplierId: suppliers.id })
    .from(tenantProfile)
    .innerJoin(
      suppliers,
      and(
        eq(suppliers.id, tenantProfile.starterSupplierId),
        publicSupplier(),
        eq(suppliers.active, true),
      ),
    )
    .where(eq(tenantProfile.tenantId, tenantId))
    .limit(1);
  return row?.supplierId ?? null;
}

/** The scope's public suppliers in its own order (never a seller's private source). */
async function findScopeSuppliers(
  database: Database,
  supplierIds: readonly string[],
): Promise<{ id: string; name: string; active: boolean }[]> {
  if (supplierIds.length === 0) {
    return [];
  }
  const rows = await database
    .select({ id: suppliers.id, name: suppliers.name, active: suppliers.active })
    .from(suppliers)
    .where(and(inArray(suppliers.id, [...supplierIds]), publicSupplier()));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return supplierIds.flatMap((supplierId) => {
    const row = byId.get(supplierId);
    return row === undefined ? [] : [row];
  });
}

/** Categories that have a listable product of these suppliers. */
async function listSupplierCategories(
  database: Database,
  supplierIds: readonly string[],
): Promise<{ name: string; slug: string }[]> {
  return database
    .selectDistinct({ name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(supplierProducts, eq(supplierProducts.categoryId, categories.id))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(
      and(inArray(suppliers.id, [...supplierIds]), productListable(), eq(suppliers.active, true)),
    )
    .orderBy(asc(categories.name));
}

function named(supplier: { id: string; name: string }): CatalogSupplier {
  return { id: supplier.id, name: supplier.name };
}

function splitByActive(found: readonly { id: string; name: string; active: boolean }[]) {
  return {
    active: found.filter((supplier) => supplier.active).map(named),
    paused: found.filter((supplier) => !supplier.active).map(named),
  };
}

/** The page of products of the chosen suppliers, with each product's recent units sold. */
async function listScopeProducts(
  database: Database,
  tenantId: string,
  query: { supplierIds: readonly string[]; filters: StoreCatalogRequest["filters"] },
  pagination: Pagination,
): Promise<Paginated<StoreCatalogProduct>> {
  // One clock for the sort and the badges, so "Mais vendidos" ranks by the numbers shown.
  const now = new Date();
  const products = await listSellableCatalog(
    database,
    tenantId,
    { ...query.filters, supplierIds: query.supplierIds, now },
    pagination,
  );
  const unitsByProduct = await countRecentUnitsSold(
    database,
    products.items.map((product) => product.id),
    now,
  );
  const items = products.items.map((product) => ({
    ...product,
    recentUnitsSold: unitsByProduct.get(product.id) ?? 0,
  }));
  return { ...products, items };
}

/**
 * The catalog of the chosen store's suppliers, decided here on the server: a store id from the
 * URL that is not one of the account's own stores is ignored, a supplier filter the store does
 * not sell is ignored, and a store without a supplier lists nothing (never the starter or
 * another one).
 */
export async function listStoreCatalog(
  database: Database,
  tenantId: string,
  request: StoreCatalogRequest,
  pagination: Pagination,
): Promise<StoreCatalog> {
  const [stores, starterSupplierId] = await Promise.all([
    listStoreConnections(database, tenantId),
    findStarterSupplierId(database, tenantId),
  ]);
  const scope = resolveCatalogScope(stores, starterSupplierId, request.storeId);
  const split = splitByActive(await findScopeSuppliers(database, scope.supplierIds));
  const supplierFilter = resolveSupplierFilter(
    split.active.map((supplier) => supplier.id),
    request.supplierId,
  );
  const base = { scope, suppliers: split.active, pausedSuppliers: split.paused, supplierFilter };
  if (split.active.length === 0) {
    const products = toPaginated<StoreCatalogProduct>([], 0, pagination);
    return { ...base, stores, products, categories: [] };
  }
  const shownIds =
    supplierFilter === null ? split.active.map((supplier) => supplier.id) : [supplierFilter];
  const [products, shownCategories] = await Promise.all([
    listScopeProducts(
      database,
      tenantId,
      { supplierIds: shownIds, filters: request.filters },
      pagination,
    ),
    listSupplierCategories(database, shownIds),
  ]);
  return { ...base, stores, products, categories: shownCategories };
}
