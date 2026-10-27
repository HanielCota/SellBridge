import {
  countSupplierParcelsByStatus,
  getSupplierPanelProfile,
  getSupplierProductTimeseries,
  getSupplierSalesSummary,
  getSupplierSalesTimeseries,
  getSupplierSetupState,
  listSupplierProductOptions,
  listSupplierProductSales,
  type SupplierProductSales,
  type SupplierSalesScope,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import {
  chartRanges,
  comparablePreviousRange,
  resolvePeriod,
} from "@sellbridge/shared/period-range";
import {
  countParcelStages,
  isRunningOut,
  stockDaysLeft,
  SUPPLIER_SALES_SITUATION_STATUSES,
} from "@sellbridge/shared/supplier-panel-sales";
import { daysBefore } from "@sellbridge/shared/time";
import { database } from "@/lib/server/database";
import type { SupplierSalesSearch } from "./sales-search";

/** Best sellers on the home card and lines on the "Por produto" chart. */
const TOP_PRODUCTS = 5;

/** "Acabando" reads the last 30 days of sales, whatever period is on screen. */
const RUNNING_OUT_WINDOW_DAYS = 30;

/** Enough rows to find every product that sold in the window. */
const RUNNING_OUT_SCAN_LIMIT = 500;

export type SupplierTopProduct = SupplierProductSales & { daysLeft: number | null };

/** The products that run out within two weeks at the last 30 days' pace. */
async function loadRunningOut(supplierId: string, now: Date) {
  const sold = await listSupplierProductSales(
    database,
    {
      supplierId,
      range: { from: daysBefore(RUNNING_OUT_WINDOW_DAYS, now), to: now },
      statuses: SUPPLIER_SALES_SITUATION_STATUSES.sold,
    },
    RUNNING_OUT_SCAN_LIMIT,
  );
  const running = sold.filter((product) =>
    isRunningOut(
      stockDaysLeft({
        availableStock: product.availableStock,
        unitsSold: product.units,
        periodDays: RUNNING_OUT_WINDOW_DAYS,
      }),
    ),
  );
  return { count: running.length, productId: running[0]?.productId ?? null };
}

function withDaysLeft(products: readonly SupplierProductSales[], periodDays: number) {
  return products.map((product) => ({
    ...product,
    daysLeft: stockDaysLeft({
      availableStock: product.availableStock,
      unitsSold: product.units,
      periodDays,
    }),
  }));
}

/** Everything the home draws for the period: totals, chart, best sellers and parcel steps. */
export async function loadSupplierSales(
  supplierId: string,
  search: SupplierSalesSearch,
  now: Date = new Date(),
) {
  const period = resolvePeriod(search, now);
  const scope: SupplierSalesScope = {
    supplierId,
    range: { from: period.from, to: period.to },
    statuses: SUPPLIER_SALES_SITUATION_STATUSES[search.situation],
    supplierProductId: search.product,
  };
  const chart = chartRanges(period, now);
  const [profile, summary, previous, timeseries, previousTimeseries, products, parcels, options] =
    await Promise.all([
      getSupplierPanelProfile(database, supplierId),
      getSupplierSalesSummary(database, scope),
      getSupplierSalesSummary(database, { ...scope, range: comparablePreviousRange(period, now) }),
      getSupplierSalesTimeseries(database, { ...scope, range: chart.current }, period.bucket),
      getSupplierSalesTimeseries(database, { ...scope, range: chart.previous }, period.bucket),
      listSupplierProductSales(database, scope, TOP_PRODUCTS),
      countSupplierParcelsByStatus(database, scope),
      listSupplierProductOptions(database, supplierId),
    ]);
  const [productSeries, runningOut, setup] = await Promise.all([
    getSupplierProductTimeseries(
      database,
      { ...scope, range: chart.current },
      { bucket: period.bucket, productIds: products.map((product) => product.productId) },
    ),
    loadRunningOut(supplierId, now),
    getSupplierSetupState(database, supplierId),
  ]);
  // Counts only: what the home showed, for support to compare with a complaint.
  logger.info("supplier_panel.sales_loaded", {
    supplierId,
    period: search.period,
    situation: search.situation,
    orders: summary.orders,
  });
  return {
    supplierName: profile.name,
    period: {
      fromDate: period.fromDate,
      toDate: period.toDate,
      days: period.days,
      bucket: period.bucket,
    },
    summary,
    previous,
    timeseries,
    previousTimeseries,
    topProducts: withDaysLeft(products, period.days),
    productSeries,
    parcelStages: countParcelStages(parcels),
    productOptions: options,
    runningOut,
    setup,
  };
}
