import { isProductSourceSetupComplete } from "@sellbridge/shared/product-sources";
import {
  findOnboardingProfile,
  getSalesByStore,
  getSalesSummary,
  getSalesTimeseries,
  getTopProducts,
  isUserEmailVerified,
  listListingTargets,
  listOrderFinancials,
  listStoreConnections,
  type ReportScope,
} from "@sellbridge/database/repositories";
import {
  financialSearchSchema,
  ORDER_STAGE_STATUSES,
  type FinancialSearch,
  periodSearchSchema,
} from "@sellbridge/shared/schemas";
import { comparablePreviousRange } from "@sellbridge/shared/period-range";
import { createServerFn } from "@tanstack/react-start";
import type { SetupProgressSnapshot } from "@/features/onboarding/setup-progress";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { buildReportScope, chartScopes, narrowToDay } from "@/features/reports/report-scope.server";

/** How many orders a picked day loads at once: the schema's largest page. */
const PICKED_DAY_PAGE_SIZE = 100;

/** Above this many days, the composition chart groups the sales by month. */
const MONTHLY_FROM_DAYS = 120;

async function loadOnboardingState(
  tenantId: string,
  userId: string,
): Promise<SetupProgressSnapshot> {
  const [profile, stores, listings, emailVerified] = await Promise.all([
    findOnboardingProfile(database, tenantId),
    listStoreConnections(database, tenantId),
    listListingTargets(database, tenantId, { status: "published" }, { page: 1, pageSize: 5 }),
    isUserEmailVerified(database, userId),
  ]);
  return {
    hasHolder: profile.holder !== null,
    hasSupplier: isProductSourceSetupComplete(
      profile.productSourceMode,
      profile.starterSupplier?.active === true,
      stores.some((store) => store.supplierId !== null),
    ),
    productSourceMode: profile.productSourceMode,
    // An account that already has a store is past this step; /lojas explains it for a new one.
    hasVerifiedEmail: emailVerified || stores.length > 0,
    hasStore: stores.length > 0,
    hasPublishedListing: listings.total > 0,
    isPublishing: listings.hasActive,
  };
}

/** Where a new account stands in the setup: holder, supplier, a store, a first publication. */
export const getSetupProgress = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .handler(async ({ context }) => loadOnboardingState(context.tenantId, context.userId));

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(periodSearchSchema)
  .handler(async ({ context, data }) => {
    const now = new Date();
    const { period, scope } = buildReportScope(context.tenantId, data, now);
    const chart = chartScopes(scope, period, now);
    // The totals compare like with like (an ongoing period against the same stretch before it);
    // the chart keeps the whole previous period behind the current one (today's: up to this hour).
    const comparableScope: ReportScope = {
      ...scope,
      range: comparablePreviousRange(period, now),
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
      getSalesSummary(database, comparableScope),
      getSalesTimeseries(database, chart.current, period.bucket),
      getSalesTimeseries(database, chart.previous, period.bucket),
      // Long periods also get one bar per month, for the composition chart.
      period.days > MONTHLY_FROM_DAYS ? getSalesTimeseries(database, scope, "month") : null,
      getSalesByStore(database, scope),
      getTopProducts(database, scope),
      listStoreConnections(database, context.tenantId),
      loadOnboardingState(context.tenantId, context.userId),
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

/** Filters, order and page of the financial statement. */
function statementQuery(search: FinancialSearch, pickedDay: string | null) {
  return {
    filters: {
      statuses: search.stage ? ORDER_STAGE_STATUSES[search.stage] : undefined,
      search: search.query,
    },
    sort: { field: search.sort, direction: search.direction },
    // A picked day comes whole (up to the page cap), so its identical sales fold together.
    pagination: pickedDay
      ? { page: search.page, pageSize: PICKED_DAY_PAGE_SIZE }
      : { page: search.page, pageSize: search.pageSize },
  };
}

export const getFinancials = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .validator(financialSearchSchema)
  .handler(async ({ context, data }) => {
    const now = new Date();
    const { period, scope } = buildReportScope(context.tenantId, data, now);
    const previousScope: ReportScope = {
      ...scope,
      range: { from: period.previousFrom, to: period.previousTo },
    };
    const chart = chartScopes(scope, period, now);
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
      period.bucket === "day" ? null : getSalesTimeseries(database, chart.current, period.bucket),
      getSalesTimeseries(database, chart.previous, period.bucket),
      period.days > MONTHLY_FROM_DAYS ? getSalesTimeseries(database, scope, "month") : null,
      listOrderFinancials(database, picked.scope, statementQuery(data, picked.day)),
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
