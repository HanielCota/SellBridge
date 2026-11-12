/**
 * The stores the store filter offers: every one, or only the chosen reseller's, so a store of
 * another reseller is never one tap away from an empty list.
 */
export function storesOfReseller<TStore extends { resellerId: string }>(
  stores: readonly TStore[],
  reseller: string | undefined,
): TStore[] {
  if (reseller === undefined) {
    return [...stores];
  }
  return stores.filter((store) => store.resellerId === reseller);
}

/**
 * The store choice that survives picking another reseller: kept when it is that reseller's, cleared
 * otherwise. With no reseller, every store fits.
 */
export function storeAfterResellerChange(
  stores: readonly { id: string; resellerId: string }[],
  store: string | undefined,
  reseller: string | undefined,
): string | undefined {
  if (store === undefined || reseller === undefined) {
    return store;
  }
  const kept = stores.some((option) => option.id === store && option.resellerId === reseller);
  return kept ? store : undefined;
}
