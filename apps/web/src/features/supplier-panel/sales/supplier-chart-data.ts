import type { SupplierProductPoint, SupplierSalesPoint } from "@sellbridge/database/repositories";
import type { MetricPoint } from "@/features/reports/dashboard-metrics";

/** The two series of the supplier chart: what it receives, or the pieces sold. */
export type SupplierSeries = "receivable" | "units";

/** The supplier home's charts (item 38): the reseller's timeline and running total, by product. */
export const SUPPLIER_CHART_KINDS = ["area", "cumulative", "products"] as const;
export type SupplierChartKind = (typeof SUPPLIER_CHART_KINDS)[number];

function valueOf(point: { units: number; receivableCents: number }, series: SupplierSeries) {
  return series === "units" ? point.units : point.receivableCents;
}

/**
 * The chosen series as the reseller chart's points, so its comparison line, 7-day average and
 * running totals (`buildChartPoints`) apply unchanged. The value rides in `revenueCents`.
 */
export function toMetricPoints(
  points: readonly SupplierSalesPoint[],
  series: SupplierSeries,
): MetricPoint[] {
  return points.map((point) => ({
    date: point.date,
    orders: point.orders,
    revenueCents: valueOf(point, series),
    profitCents: 0,
    pendingCostRevenueCents: 0,
  }));
}

export interface ProductRow {
  date: string;
  /** Each product's value on this date, by product id; zero where it did not sell. */
  values: Record<string, number>;
}

/** One row per date of the period, with every product's value, for the "Por produto" lines. */
export function buildProductRows(
  dates: readonly string[],
  productIds: readonly string[],
  points: readonly SupplierProductPoint[],
  series: SupplierSeries,
): ProductRow[] {
  return dates.map((date) => ({
    date,
    values: Object.fromEntries(
      productIds.map((productId) => {
        const point = points.find((item) => item.date === date && item.productId === productId);
        return [productId, point === undefined ? 0 : valueOf(point, series)];
      }),
    ),
  }));
}
