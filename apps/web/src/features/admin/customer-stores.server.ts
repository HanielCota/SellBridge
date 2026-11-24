import {
  findStoreSuppliers,
  getStoreLastSyncs,
  listBuyerAddressChecks,
  type BuyerAddressCheckView,
  type StoreConnectionSummary,
} from "@sellbridge/database/repositories";
import { MARKETPLACE_LABELS } from "@sellbridge/marketplaces";
import { database } from "@/lib/server/database";

/** The suppliers a shop sells, oldest first, leaving out any id no longer found. */
function suppliersOf<Supplier>(
  store: StoreConnectionSummary,
  suppliersById: ReadonlyMap<string, Supplier>,
): Supplier[] {
  return store.supplierIds.flatMap((supplierId) => {
    const supplier = suppliersById.get(supplierId);
    return supplier === undefined ? [] : [supplier];
  });
}

/** Only what the team's line needs: the supplier's address stays on the reseller's own page. */
function buyerAddressOf(check: BuyerAddressCheckView | undefined) {
  if (check === undefined) {
    return null;
  }
  const { result, supplierName, releasedAt, releaseNote } = check;
  return { result, supplierName, releasedAt, releaseNote };
}

/**
 * Each shop of the customer for the admin page: the suppliers it sells (none while pending) and
 * the same health facts the seller sees on /lojas, so support reads what the seller reads.
 */
export async function presentCustomerStores(
  tenantId: string,
  stores: readonly StoreConnectionSummary[],
) {
  const [suppliers, lastSyncs, buyerAddresses] = await Promise.all([
    findStoreSuppliers(
      database,
      stores.flatMap((store) => store.supplierIds),
    ),
    getStoreLastSyncs(
      database,
      tenantId,
      stores.map((store) => store.id),
    ),
    listBuyerAddressChecks(database, tenantId),
  ]);
  const byId = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  return stores.map((store) => ({
    id: store.id,
    shopName: store.shopName,
    marketplace: store.marketplace,
    marketplaceLabel: MARKETPLACE_LABELS[store.marketplace],
    status: store.status,
    lastError: store.lastError,
    lastWebhookAt: store.lastWebhookAt,
    lastSyncedAt: lastSyncs.get(store.id) ?? null,
    suppliers: suppliersOf(store, byId),
    buyerAddress: buyerAddressOf(buyerAddresses.get(store.id)),
  }));
}
