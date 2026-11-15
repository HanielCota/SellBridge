/**
 * Whose products the reseller's catalog shows (MVP function 1). The platform sells only supplier
 * products and the catalog follows the chosen store: every supplier it sells, or one of them when
 * the reseller filters by supplier.
 */
export interface CatalogScopeStore {
  id: string;
  /** Oldest link first; empty while the store is pending. */
  supplierIds: readonly string[];
}

export type CatalogScope =
  /** A connected (not disconnected) store of the account and the suppliers it sells, maybe none. */
  | { kind: "store"; storeId: string; supplierIds: readonly string[] }
  /** No store yet: the supplier picked in the onboarding, or nothing. */
  | { kind: "starter"; storeId: null; supplierIds: readonly string[] };

/**
 * `stores` are the account's own stores that still count (not disconnected), oldest first.
 * A requested id that is not among them is ignored, so a URL never opens another account's store.
 * A store without a supplier stays empty: it never borrows the starter or another supplier.
 */
export function resolveCatalogScope(
  stores: readonly CatalogScopeStore[],
  starterSupplierId: string | null,
  requestedStoreId: string | undefined,
): CatalogScope {
  const [first] = stores;
  if (first === undefined) {
    const supplierIds = starterSupplierId === null ? [] : [starterSupplierId];
    return { kind: "starter", storeId: null, supplierIds };
  }
  const chosen = stores.find((store) => store.id === requestedStoreId) ?? first;
  return { kind: "store", storeId: chosen.id, supplierIds: chosen.supplierIds };
}

/**
 * The supplier the reseller filtered the catalog by, kept only when the scope sells it: a
 * supplier id from the URL never opens a supplier the chosen store does not sell.
 */
export function resolveSupplierFilter(
  scopeSupplierIds: readonly string[],
  requestedSupplierId: string | undefined,
): string | null {
  if (requestedSupplierId === undefined) {
    return null;
  }
  return scopeSupplierIds.includes(requestedSupplierId) ? requestedSupplierId : null;
}
