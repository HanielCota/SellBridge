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
} from "@sellbridge/db/repositories";
import { financialSearchSchema, periodSearchSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@/lib/server/db";
import { tenantMiddleware } from "@/lib/server/middleware";
import { buildReportScope } from "@/lib/server/report-scope";

async function loadOnboardingState(tenantId: string) {
  const [region, stores, listings] = await Promise.all([
    findTenantRegion(db, tenantId),
    listStoreConnections(db, tenantId),
    listListingTargets(db, tenantId, { status: "published" }, { page: 1, pageSize: 5 }),
  ]);
  return {
    hasRegion: region !== null,
    hasStore: stores.length > 0,
    hasPublishedListing: listings.total > 0,
  };
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(periodSearchSchema)
  .handler(async ({ context, data }) => {
    const { period, scope } = buildReportScope(context.tenantId, data);
    const previousScope: ReportScope = {
      ...scope,
      range: { from: period.previousFrom, to: period.previousTo },
    };
    const [summary, previous, timeseries, byStore, topProducts, stores, onboarding] =
      await Promise.all([
        getSalesSummary(db, scope),
        getSalesSummary(db, previousScope),
        getSalesTimeseries(db, scope, period.bucket),
        getSalesByStore(db, scope),
        getTopProducts(db, scope),
        listStoreConnections(db, context.tenantId),
        loadOnboardingState(context.tenantId),
      ]);
    return {
      period: {
        fromDate: period.fromDate,
        toDate: period.toDate,
        days: period.days,
        bucket: period.bucket,
      },
      summary,
      previous,
      timeseries,
      byStore,
      topProducts,
      stores: stores.map((store) => ({ id: store.id, name: store.shopName })),
      onboarding,
    };
  });

export const getFinancials = createServerFn({ method: "GET" })
  .middleware([tenantMiddleware])
  .inputValidator(financialSearchSchema)
  .handler(async ({ context, data }) => {
    const { period, scope } = buildReportScope(context.tenantId, data);
    const [summary, orders, stores] = await Promise.all([
      getSalesSummary(db, scope),
      listOrderFinancials(
        db,
        scope,
        { status: data.status, search: data.q },
        { field: data.sort, direction: data.dir },
        { page: data.page, pageSize: data.pageSize },
      ),
      listStoreConnections(db, context.tenantId),
    ]);
    return {
      period: { fromDate: period.fromDate, toDate: period.toDate },
      summary,
      orders,
      stores: stores.map((store) => ({ id: store.id, name: store.shopName })),
    };
  });
