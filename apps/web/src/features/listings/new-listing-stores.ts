/** The fields of a store that decide whether a product can be published in it. */
interface PublishableStore {
  id: string;
  status: string;
  supplierId: string | null;
}

export interface NewListingStoreChoice<Store extends PublishableStore> {
  /** Connected stores selling the product's supplier, each marked when it already sells it. */
  stores: (Store & { listed: boolean })[];
  /** Other connected stores exist, but they sell another supplier. */
  hasOtherStores: boolean;
  /** MVP (2026-10-22): own products take no new publication, so the form is not offered. */
  ownProductClosed: boolean;
}

/** Which stores the new listing page offers for a product: each store sells a single supplier. */
export function chooseNewListingStores<Store extends PublishableStore>(
  product: { catalogKind: "seller" | "supplier"; supplierId: string },
  stores: readonly Store[],
  listedStoreIds: ReadonlySet<string>,
): NewListingStoreChoice<Store> {
  if (product.catalogKind === "seller") {
    return { stores: [], hasOtherStores: false, ownProductClosed: true };
  }
  const connected = stores.filter((store) => store.status === "connected");
  return {
    stores: connected
      .filter((store) => store.supplierId === product.supplierId)
      .map((store) => ({ ...store, listed: listedStoreIds.has(store.id) })),
    hasOtherStores: connected.some((store) => store.supplierId !== product.supplierId),
    ownProductClosed: false,
  };
}
