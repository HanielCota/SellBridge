import {
  countSupplierShipmentsByTab,
  getSupplierPanelProfile,
  getSupplierReputationStats,
  listSupplierHealthDrillDown,
  listSupplierOutOfStockListed,
  listSupplierProductPhotos,
  listSupplierRejectedProducts,
  listSupplierShipments,
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
  type HealthDrillDownRow,
  type HealthMetricKey,
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

export interface SupplierPerformance {
  supplierName: string;
  health: SupplierHealth;
  reputation: SupplierReputation;
}

/** Thermometer and public score of the "Desempenho" page. */
export async function loadSupplierPerformance(supplierId: string): Promise<SupplierPerformance> {
  const now = new Date();
  const [profile, healthInput, reputation] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    loadSupplierHealthInput(database, { supplierId, now }),
    loadPublicReputation(supplierId, now),
  ]);
  return { supplierName: profile.name, health: computeSupplierHealth(healthInput), reputation };
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
}

/** The queue's most urgent parcels (the "A fazer" tab), each with its product photo. */
async function loadHomeOrders(supplierId: string, now: Date) {
  const [page, counts] = await Promise.all([
    listSupplierShipments(database, { supplierId, tab: "todo", query: "", page: 1 }, now),
    countSupplierShipmentsByTab(database, { supplierId, query: "" }, now),
  ]);
  const skus = page.items.map((row) => photoSkuOf(row.items)).filter((sku) => sku !== null);
  const photos = await listSupplierProductPhotos(database, { supplierId, skus });
  const rows = page.items.map((row) => {
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
  const [profile, healthInput, orders, stock, rejectedProducts] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    loadSupplierHealthInput(database, { supplierId, now }),
    loadHomeOrders(supplierId, now),
    listSupplierOutOfStockListed(database, supplierId),
    listSupplierRejectedProducts(database, supplierId),
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
  };
}

/** The orders of the last 60 days that count against one metric. */
export async function loadHealthDrillDown(
  supplierId: string,
  metric: HealthMetricKey,
): Promise<HealthDrillDownRow[]> {
  await getSupplierPanelProfile(database, supplierId);
  return listSupplierHealthDrillDown(database, { supplierId, metric, now: new Date() });
}
