import {
  getSupplierPanelProfile,
  getSupplierReputationStats,
  listSupplierHealthDrillDown,
  listSupplierOrderParcels,
  listSupplierProductPhotos,
  loadSupplierHealthInput,
  type SupplierOrderParcel,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import {
  computeSupplierHealth,
  type HealthDrillDownRow,
  type HealthMetricKey,
  type SupplierHealth,
} from "@sellbridge/shared/supplier-panel-health";
import {
  supplierHealthFacts,
  type HealthMetricFacts,
} from "@sellbridge/shared/supplier-panel-health-facts";
import { photoSkuOf } from "@sellbridge/shared/supplier-panel-home-queue";
import {
  computeSupplierReputation,
  emptyReputationStats,
  SCORE_WINDOW_DAYS,
  type SupplierReputation,
} from "@sellbridge/shared/supplier-score";
import { daysBefore } from "@sellbridge/shared/time";
import { database } from "@/lib/server/database";
import { reviewSummaryOf, type ReviewSummary } from "./review-summary";

export interface SupplierPerformance {
  supplierName: string;
  health: SupplierHealth;
  /** The counts behind each metric, over the same window as `health`. */
  facts: Record<HealthMetricKey, HealthMetricFacts>;
  /** The supplier's own accept and dispatch times, in hours from the forward. */
  deadlines: { acceptWithinHours: number | null; dispatchWithinHours: number | null };
  /** The public score resellers see (90 days), next to the supplier's own 60-day level. */
  reputation: SupplierReputation;
  reviews: ReviewSummary;
}

/** Thermometer, public score and reviews of the "Desempenho" page. */
export async function loadSupplierPerformance(supplierId: string): Promise<SupplierPerformance> {
  const now = new Date();
  const [profile, healthInput, reputationStats] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    loadSupplierHealthInput(database, { supplierId, now }),
    getSupplierReputationStats(database, [supplierId], daysBefore(SCORE_WINDOW_DAYS, now)),
  ]);
  const stats = reputationStats.get(supplierId) ?? emptyReputationStats();
  return {
    supplierName: profile.name,
    health: computeSupplierHealth(healthInput),
    facts: supplierHealthFacts(healthInput),
    deadlines: {
      acceptWithinHours: profile.acceptWithinHours,
      dispatchWithinHours: profile.dispatchWithinHours,
    },
    reputation: computeSupplierReputation(stats),
    reviews: reviewSummaryOf(stats),
  };
}

/** One order behind a metric with the product, the store and the parcel it points to. */
export interface PerformanceOrderRow extends HealthDrillDownRow {
  /** "Vestido midi" or "Vestido midi e mais 1 item"; null when the parcel is gone. */
  title: string | null;
  units: number;
  imageUrl: string | null;
  marketplace: string | null;
  /** Where the parcel stands, for the Pedidos tab the row opens; null when it is gone. */
  shipmentStatus: FulfillmentStatus | null;
}

function itemsTitle(items: SupplierOrderParcel["items"]): string | null {
  const [first, ...rest] = items;
  if (first === undefined) {
    return null;
  }
  if (rest.length === 0) {
    return first.title;
  }
  return `${first.title} e mais ${rest.length} ${rest.length === 1 ? "item" : "itens"}`;
}

function withParcel(
  row: HealthDrillDownRow,
  parcel: SupplierOrderParcel | undefined,
  photos: ReadonlyMap<string, string>,
): PerformanceOrderRow {
  if (parcel === undefined) {
    return {
      ...row,
      title: null,
      units: 0,
      imageUrl: null,
      marketplace: null,
      shipmentStatus: null,
    };
  }
  const sku = photoSkuOf(parcel.items);
  return {
    ...row,
    shipmentId: row.shipmentId ?? parcel.shipmentId,
    title: itemsTitle(parcel.items),
    units: parcel.items.reduce((total, item) => total + item.quantity, 0),
    imageUrl: sku === null ? null : (photos.get(sku) ?? null),
    marketplace: parcel.marketplace,
    shipmentStatus: parcel.status,
  };
}

/** The orders of the last 60 days that count against one metric, each with its product. */
export async function loadPerformanceOrders(
  supplierId: string,
  metric: HealthMetricKey,
): Promise<PerformanceOrderRow[]> {
  await getSupplierPanelProfile(database, supplierId);
  const rows = await listSupplierHealthDrillDown(database, { supplierId, metric, now: new Date() });
  const parcels = await listSupplierOrderParcels(database, {
    supplierId,
    orderIds: rows.map((row) => row.orderId),
  });
  const skus = [...parcels.values()].map((parcel) => photoSkuOf(parcel.items));
  const photos = await listSupplierProductPhotos(database, {
    supplierId,
    skus: skus.filter((sku) => sku !== null),
  });
  const missing = rows.filter((row) => !parcels.has(row.orderId)).length;
  if (missing > 0) {
    // Ids and counts only: a review whose parcel is gone still lists, without a product.
    logger.warn("supplier_panel.performance_rows_without_parcel", { supplierId, metric, missing });
  }
  return rows.map((row) => withParcel(row, parcels.get(row.orderId), photos));
}
