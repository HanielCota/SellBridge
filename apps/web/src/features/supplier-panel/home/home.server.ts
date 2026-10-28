import {
  countSupplierShipmentsByTab,
  getSupplierPanelProfile,
  getSupplierReputationStats,
  listSupplierOutOfStockListed,
  listSupplierProductPhotos,
  listSupplierRejectedProducts,
  listSupplierHomeShipments,
  loadSupplierHealthInput,
  type SupplierShipmentRow,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  catalogFixes,
  HOME_GROUP_LIMIT,
  photoSkuOf,
  splitHomeOrders,
  type CatalogFix,
  type HomeOrderGroups,
} from "@sellbridge/shared/supplier-panel-home-queue";
import {
  computeSupplierHealth,
  type SupplierHealth,
} from "@sellbridge/shared/supplier-panel-health";
import {
  computeSupplierReputation,
  emptyReputationStats,
  SCORE_WINDOW_DAYS,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import { daysBefore } from "@sellbridge/shared/time";
import { database } from "@/lib/server/database";

/** The public score resellers see (90 days), next to the supplier's own 60-day thermometer. */
async function loadPublicReputation(supplierId: string, now: Date): Promise<SupplierReputation> {
  const stats = await getSupplierReputationStats(
    database,
    [supplierId],
    daysBefore(SCORE_WINDOW_DAYS, now),
  );
  return computeSupplierReputation(stats.get(supplierId) ?? emptyReputationStats());
}

/** A parcel of the home list, with the main photo of its first item. */
export type SupplierHomeOrderRow = SupplierShipmentRow & { imageUrl: string | null };

export interface SupplierHome {
  supplierName: string;
  /** The first rows of each group, most urgent first. */
  orders: HomeOrderGroups<SupplierHomeOrderRow>;
  /** Every parcel of each group, for the "Ver todos" link. */
  orderTotals: { accept: number; progress: number };
  catalog: CatalogFix[];
  health: SupplierHealth;
  /** The public "Fornecedor destaque" badge resellers see: the home's green note. */
  highlighted: boolean;
}

/** The queue's most urgent parcels (the "A fazer" tab), each with its product photo. */
async function loadHomeOrders(supplierId: string, now: Date) {
  const [shipments, counts] = await Promise.all([
    listSupplierHomeShipments(database, supplierId, HOME_GROUP_LIMIT, now),
    countSupplierShipmentsByTab(database, { supplierId, query: "" }, now),
  ]);
  const skus = shipments.map((row) => photoSkuOf(row.items)).filter((sku) => sku !== null);
  const photos = await listSupplierProductPhotos(database, { supplierId, skus });
  const rows = shipments.map((row) => {
    const sku = photoSkuOf(row.items);
    return { ...row, imageUrl: sku === null ? null : (photos.get(sku) ?? null) };
  });
  const groups = splitHomeOrders(rows);
  return {
    orders: {
      accept: groups.accept.slice(0, HOME_GROUP_LIMIT),
      progress: groups.progress.slice(0, HOME_GROUP_LIMIT),
    },
    orderTotals: { accept: counts.forwarded, progress: counts.todo - counts.forwarded },
  };
}

/** The "Início" page: one list of what needs the supplier, and the health in one line. */
export async function loadSupplierHome(supplierId: string): Promise<SupplierHome> {
  const now = new Date();
  const [profile, healthInput, orders, stock, rejectedProducts, reputation] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    loadSupplierHealthInput(database, { supplierId, now }),
    loadHomeOrders(supplierId, now),
    listSupplierOutOfStockListed(database, supplierId),
    listSupplierRejectedProducts(database, supplierId),
    loadPublicReputation(supplierId, now),
  ]);
  const catalog = catalogFixes(stock, rejectedProducts);
  // Ids and counts only: what the list showed, for support to compare with a complaint.
  logger.info("supplier_panel.home_loaded", {
    supplierId,
    acceptTotal: orders.orderTotals.accept,
    progressTotal: orders.orderTotals.progress,
    catalogFixes: catalog.length,
  });
  return {
    supplierName: profile.name,
    ...orders,
    catalog,
    health: computeSupplierHealth(healthInput),
    highlighted: reputation.highlighted,
  };
}
