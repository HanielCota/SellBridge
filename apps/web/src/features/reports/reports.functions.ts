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
import { financialSearchSchema, periodSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";
import { buildReportScope } from "@/features/reports/report-scope.server";

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
    const [summary, previous, timeseries, byStore, topProducts, stores, onboarding] =
      await Promise.all([
        getSalesSummary(database, scope),
        getSalesSummary(database, previousScope),
        getSalesTimeseries(database, scope, period.bucket),
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
    const [summary, orders, stores] = await Promise.all([
      getSalesSummary(database, scope),
      listOrderFinancials(database, scope, {
        filters: { status: data.status, search: data.query },
        sort: { field: data.sort, direction: data.direction },
        pagination: { page: data.page, pageSize: data.pageSize },
      }),
      listStoreConnections(database, context.tenantId),
    ]);
    return {
      period: { fromDate: period.fromDate, toDate: period.toDate },
      summary,
      orders,
      stores: stores.map((store) => ({ id: store.id, name: store.shopName })),
    };
  });
