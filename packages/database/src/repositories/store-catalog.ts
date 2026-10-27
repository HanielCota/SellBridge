import { resolveCatalogScope, type CatalogScope } from "@sellbridge/shared/catalog-scope";
import { toPaginated, type Paginated, type Pagination } from "@sellbridge/shared/schemas";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { categories, supplierProducts, suppliers, tenantProfile } from "../schema/index.ts";
import { productListable, publicSupplier } from "./sql/sellable.ts";
import { listStoreConnections, type StoreConnectionSummary } from "./stores.ts";
import {
  listSellableCatalog,
  type SellableCatalogFilters,
  type SellableCatalogProduct,
} from "./suppliers.ts";

/** The catalog of one store's supplier (MVP function 1): what the reseller page reads. */
export interface StoreCatalog {
  scope: CatalogScope;
  /** The scope's active supplier, or null when it has none (no supplier, no starter, or paused). */
  supplier: { id: string; name: string } | null;
  /** The store's supplier when the platform deactivated it: the reseller must pick another. */
  pausedSupplier: { id: string; name: string } | null;
  /** The account's stores that still count (not disconnected), for the store picker. */
  stores: StoreConnectionSummary[];
  products: Paginated<SellableCatalogProduct>;
  categories: { name: string; slug: string }[];
}

export interface StoreCatalogRequest {
  /** The store picked in the URL; ignored unless it is one of the account's own stores. */
  storeId?: string | undefined;
  filters: Omit<SellableCatalogFilters, "supplierId">;
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

/** A public supplier's name, or null when the id is not one (never a seller's private source). */
async function findScopeSupplier(
  database: Database,
  supplierId: string,
): Promise<{ id: string; name: string; active: boolean } | null> {
  const [row] = await database
    .select({ id: suppliers.id, name: suppliers.name, active: suppliers.active })
    .from(suppliers)
    .where(and(eq(suppliers.id, supplierId), publicSupplier()))
    .limit(1);
  return row ?? null;
}

/** Categories that have a listable product of this supplier. */
async function listSupplierCategories(
  database: Database,
  supplierId: string,
): Promise<{ name: string; slug: string }[]> {
  return database
    .selectDistinct({ name: categories.name, slug: categories.slug })
    .from(categories)
    .innerJoin(supplierProducts, eq(supplierProducts.categoryId, categories.id))
    .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
    .where(and(eq(suppliers.id, supplierId), productListable(), eq(suppliers.active, true)))
    .orderBy(asc(categories.name));
}

/**
 * The catalog of the chosen store's supplier, decided here on the server: a store id from the
 * URL that is not one of the account's own stores is ignored, a supplier filter from the URL is
 * never read, and a store without a supplier lists nothing (never the starter or another one).
 */
export async function listStoreCatalog(
  database: Database,
  tenantId: string,
  request: StoreCatalogRequest,
  pagination: Pagination,
): Promise<StoreCatalog> {
  const { storeId: requestedStoreId, filters } = request;
  const [stores, starterSupplierId] = await Promise.all([
    listStoreConnections(database, tenantId),
    findStarterSupplierId(database, tenantId),
  ]);
  const scope = resolveCatalogScope(stores, starterSupplierId, requestedStoreId);
  const found =
    scope.supplierId === null ? null : await findScopeSupplier(database, scope.supplierId);
  const pausedSupplier =
    found !== null && !found.active ? { id: found.id, name: found.name } : null;
  const supplier = found !== null && found.active ? { id: found.id, name: found.name } : null;
  if (supplier === null) {
    const products = toPaginated<SellableCatalogProduct>([], 0, pagination);
    return { scope, supplier, pausedSupplier, stores, products, categories: [] };
  }
  const [products, supplierCategories] = await Promise.all([
    listSellableCatalog(database, tenantId, { ...filters, supplierId: supplier.id }, pagination),
    listSupplierCategories(database, supplier.id),
  ]);
  return { scope, supplier, pausedSupplier, stores, products, categories: supplierCategories };
}
