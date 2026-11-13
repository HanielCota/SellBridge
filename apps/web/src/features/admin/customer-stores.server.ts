import {
  findStoreSuppliers,
  getStoreLastSyncs,
  type StoreConnectionSummary,
} from "@sellbridge/database/repositories";
import { MARKETPLACE_LABELS } from "@sellbridge/marketplaces";
import { database } from "@/lib/server/database";

/** The supplier the team's screen names: the store's oldest one while it shows a single one. */
function firstSupplierOf<Supplier>(
  store: StoreConnectionSummary,
  suppliersById: ReadonlyMap<string, Supplier>,
): Supplier | null {
  const [supplierId] = store.supplierIds;
  return supplierId === undefined ? null : (suppliersById.get(supplierId) ?? null);
}

/**
 * Each shop of the customer for the admin page: the one supplier it sells (null while pending)
 * and the same health facts the seller sees on /lojas, so support reads what the seller reads.
 */
export async function presentCustomerStores(
  tenantId: string,
  stores: readonly StoreConnectionSummary[],
) {
  const [suppliers, lastSyncs] = await Promise.all([
    findStoreSuppliers(
      database,
      stores.flatMap((store) => store.supplierIds),
    ),
    getStoreLastSyncs(
      database,
      tenantId,
      stores.map((store) => store.id),
    ),
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
    supplier: firstSupplierOf(store, byId),
  }));
}
