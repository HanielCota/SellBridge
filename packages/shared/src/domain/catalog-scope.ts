/**
 * Whose products the reseller's catalog shows (MVP function 1). The platform sells only supplier
 * products and every store sells exactly one supplier, so the catalog follows the chosen store.
 */
export interface CatalogScopeStore {
  id: string;
  supplierId: string | null;
}

export type CatalogScope =
  /** A connected (not disconnected) store of the account; its supplier, or nothing yet. */
  | { kind: "store"; storeId: string; supplierId: string | null }
  /** No store yet: the supplier picked in the onboarding, or nothing. */
  | { kind: "starter"; storeId: null; supplierId: string | null };

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
    return { kind: "starter", storeId: null, supplierId: starterSupplierId };
  }
  const chosen = stores.find((store) => store.id === requestedStoreId) ?? first;
  return { kind: "store", storeId: chosen.id, supplierId: chosen.supplierId };
}
