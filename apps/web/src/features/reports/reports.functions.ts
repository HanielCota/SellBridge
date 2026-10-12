import {
  findTenantRegion,
  getSalesByStore,
  getSalesSummary,
  getSalesTimeseries,
  getTopProducts,
  listListingTargets,
  listOrderFinancials,
  listStoreConnections,
  type ReportScope,
} from "@sellbridge/database/repositories";
import {
  financialSearchSchema,
  ORDER_STAGE_STATUSES,
  periodSearchSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { buildReportScope, narrowToDay } from "@/features/reports/report-scope.server";

/** How many orders a picked day loads at once: the schema's largest page. */
const PICKED_DAY_PAGE_SIZE = 100;

/** Above this many days, the composition chart groups the sales by month. */
const MONTHLY_FROM_DAYS = 120;

async function loadOnboardingState(tenantId: string) {
  const [region, stores, listings] = await Promise.all([
    findTenantRegion(database, tenantId),
    listStoreConnections(database, tenantId),
    listListingTargets(database, tenantId, { status: "published" }, { page: 1, pageSize: 5 }),
  ]);
  return {
    hasRegion: region !== null,
    hasStore: stores.length > 0,
    hasPublishedListing: listings.total > 0,
  };
}

/** Where a new account stands in the setup: region, a store, a first publication. */
export const getSetupProgress = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => loadOnboardingState(context.tenantId));

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(periodSearchSchema)
  .handler(async ({ context, data }) => {
    const { period, scope } = buildReportScope(context.tenantId, data);
    const previousScope: ReportScope = {
      ...scope,
      range: { from: period.previousFrom, to: period.previousTo },
    };
    const [
      summary,
      previous,
      timeseries,
      previousTimeseries,
      monthly,
      byStore,
      topProducts,
      stores,
      onboarding,
    ] = await Promise.all([
      getSalesSummary(database, scope),
      getSalesSummary(database, previousScope),
      getSalesTimeseries(database, scope, period.bucket),
      getSalesTimeseries(database, previousScope, period.bucket),
      // Long periods also get one bar per month, for the composition chart.
      period.days > MONTHLY_FROM_DAYS ? getSalesTimeseries(database, scope, "month") : null,
      getSalesByStore(database, scope),
      getTopProducts(database, scope),
      listStoreConnections(database, context.tenantId),
      loadOnboardingState(context.tenantId),
    ]);
    return {
      period: {
        fromDate: period.fromDate,
        toDate: period.toDate,
        previousFromDate: period.previousFromDate,
        previousToDate: period.previousToDate,
        days: period.days,
        bucket: period.bucket,
      },
      summary,
      previous,
      timeseries,
      previousTimeseries,
      monthly,
      byStore,
      topProducts,
      stores: stores.map((store) => ({ id: store.id, name: store.shopName, status: store.status })),
      onboarding,
    };
  });

export const getFinancials = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(financialSearchSchema)
  .handler(async ({ context, data }) => {
    const { period, scope } = buildReportScope(context.tenantId, data);
    const previousScope: ReportScope = {
      ...scope,
      range: { from: period.previousFrom, to: period.previousTo },
    };
    // A picked day narrows the summary and the statement; the chart keeps the whole period.
    const picked = narrowToDay(scope, period, data.day);
    const [
      summary,
      periodSummary,
      previous,
      days,
      bucketed,
      previousTimeseries,
      monthly,
      orders,
      stores,
    ] = await Promise.all([
      getSalesSummary(database, picked.scope),
      picked.day ? getSalesSummary(database, scope) : null,
      getSalesSummary(database, previousScope),
      // Whole-day totals for the statement's day headings, so a day split across pages still
      // shows what it really made.
      getSalesTimeseries(database, scope, "day"),
      // The chart uses the dashboard's buckets; daily ones are the query above.
      period.bucket === "day" ? null : getSalesTimeseries(database, scope, period.bucket),
      getSalesTimeseries(database, previousScope, period.bucket),
      period.days > MONTHLY_FROM_DAYS ? getSalesTimeseries(database, scope, "month") : null,
      listOrderFinancials(database, picked.scope, {
        filters: {
          statuses: data.stage ? ORDER_STAGE_STATUSES[data.stage] : undefined,
          search: data.query,
        },
        sort: { field: data.sort, direction: data.direction },
        // A picked day comes whole (up to the page cap), so its identical sales fold together.
        pagination: picked.day
          ? { page: data.page, pageSize: PICKED_DAY_PAGE_SIZE }
          : { page: data.page, pageSize: data.pageSize },
      }),
      listStoreConnections(database, context.tenantId),
    ]);
    return {
      period: {
        fromDate: period.fromDate,
        toDate: period.toDate,
        days: period.days,
        bucket: period.bucket,
      },
      day: picked.day,
      summary,
      /** The whole period, for the chart's headline while a day narrows `summary`. */
      periodSummary: periodSummary ?? summary,
      previous,
      days: days.map((day) => ({
        date: day.date,
        orders: day.orders,
        profitCents: day.profitCents,
      })),
      timeseries: bucketed ?? days,
      previousTimeseries,
      monthly,
      orders,
      stores: stores.map((store) => ({ id: store.id, name: store.shopName })),
    };
  });
