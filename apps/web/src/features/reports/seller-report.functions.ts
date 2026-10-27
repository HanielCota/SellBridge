import {
  getOrderStatusCounts,
  getSalesByStore,
  getSalesHeatmap,
  getSalesSummary,
  getSalesTimeseries,
  getTopProducts,
  listSellerReportCases,
  type ReportScope,
} from "@sellbridge/database/repositories";
import {
  monthRange,
  resolveReportPeriod,
  trendMonths,
  type ReportPeriod,
  type ReportRange,
} from "@sellbridge/shared/report-period";
import { reportPeriodSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { CASES_PER_TAB, type MonthlyReport } from "@/features/report-kit/report-model";
import { serveMonthlyReport } from "@/features/report-kit/report-snapshot.server";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { tenantMiddleware } from "@/lib/server/middleware";
import {
  buildSellerReport,
  type SellerPeriodNumbers,
  type SellerTrendMonth,
} from "./seller-report";

/** Products on the "most sold" chart. */
const TOP_PRODUCTS = 5;
/** Products loaded for the previous period, so this period's top ones find their old revenue. */
const PREVIOUS_PRODUCTS = 50;

function scopeOf(tenantId: string, range: ReportRange): ReportScope {
  return {
    tenantId,
    range: { from: range.from, to: range.to },
    platformFeeBasisPoints: environment.PLATFORM_FEE_BASIS_POINTS,
  };
}

async function loadPeriodNumbers(
  scope: ReportScope,
  productLimit: number,
): Promise<SellerPeriodNumbers> {
  const [summary, statuses, byStore, topProducts] = await Promise.all([
    getSalesSummary(database, scope),
    getOrderStatusCounts(database, scope),
    getSalesByStore(database, scope),
    getTopProducts(database, scope, productLimit),
  ]);
  return { summary, statuses, byStore, topProducts };
}

/** Profit per month of the trend, the last month cut where the period ends. */
async function loadTrend(tenantId: string, period: ReportPeriod): Promise<SellerTrendMonth[]> {
  const months = trendMonths(period);
  const first = months[0];
  if (first === undefined) {
    return [];
  }
  const points = await getSalesTimeseries(
    database,
    scopeOf(tenantId, { from: monthRange(first).from, to: period.to }),
    "month",
  );
  return points.map((point) => ({
    month: point.date.slice(0, 7),
    orders: point.orders,
    profitCents: point.profitCents,
  }));
}

async function loadCases(scope: ReportScope) {
  const [costPending, cancelled, returned] = await Promise.all([
    listSellerReportCases(database, scope, { kind: "cost_pending", limit: CASES_PER_TAB }),
    listSellerReportCases(database, scope, { kind: "cancelled", limit: CASES_PER_TAB }),
    listSellerReportCases(database, scope, { kind: "returned", limit: CASES_PER_TAB }),
  ]);
  return { cost_pending: costPending, cancelled, returned };
}

async function computeSellerReport(tenantId: string, period: ReportPeriod): Promise<MonthlyReport> {
  const scope = scopeOf(tenantId, period);
  const [current, previous, trend, heatmap, cases] = await Promise.all([
    loadPeriodNumbers(scope, TOP_PRODUCTS),
    loadPeriodNumbers(scopeOf(tenantId, period.previous), PREVIOUS_PRODUCTS),
    loadTrend(tenantId, period),
    getSalesHeatmap(database, scope),
    loadCases(scope),
  ]);
  return buildSellerReport({
    current,
    previous,
    trend,
    heatmap,
    cases,
    platformFeeBasisPoints: environment.PLATFORM_FEE_BASIS_POINTS,
  });
}

/** The reseller's "Relatório de vendas": a closed month is kept, the rest computed live. */
export const getSellerReport = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(reportPeriodSearchSchema)
  .handler(async ({ context, data }) => {
    const now = new Date();
    const period = resolveReportPeriod(data, now);
    return serveMonthlyReport({
      scope: "seller",
      ownerId: context.tenantId,
      period,
      now,
      compute: () => computeSellerReport(context.tenantId, period),
    });
  });
