import {
  countSupplierSellingStores,
  getSupplierPanelProfile,
  getSupplierSalesSummary,
  getSupplierSalesTimeseries,
  listSupplierIdleProducts,
  listSupplierProductSales,
  listSupplierSalesByMarketplace,
  type SupplierSalesScope,
} from "@sellbridge/database/repositories";
import { MARKETPLACE_LABELS } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { SUPPLIER_SALES_SITUATION_STATUSES } from "@sellbridge/shared/supplier-panel-sales";
import { daysBefore } from "@sellbridge/shared/time";
import { database } from "@/lib/server/database";
import { chartBucketOf, marketplaceShares } from "./sales-page-format";

/** Best sellers listed, by pieces or by value. */
const BEST_SELLERS = 5;

/** "Esgotados que vendiam" and "Sem venda há 30 dias" read the last 30 days, whatever the period. */
const RECENT_DAYS = 30;

/** Products listed in each of the two "act on it" cards. */
const SHELF_ROWS = 5;

const SOLD = SUPPLIER_SALES_SITUATION_STATUSES.sold;

/** The marketplace's name ("Mercado Livre"), or its id when the app does not know it. */
function marketplaceName(id: string): string {
  const match = Object.entries(MARKETPLACE_LABELS).find(([key]) => key === id);
  return match?.[1] ?? id;
}

/** Products that sold in the last 30 days and have nothing left to sell now. */
async function loadSoldOut(supplierId: string, now: Date) {
  return listSupplierProductSales(
    database,
    { supplierId, range: { from: daysBefore(RECENT_DAYS, now), to: now }, statuses: SOLD },
    SHELF_ROWS,
    { soldOutOnly: true },
  );
}

/** The "Vendas" page for one month or range: totals, chart, channels and the shelf. */
export async function loadSupplierSalesPage(
  supplierId: string,
  search: ReportPeriodSearch,
  now: Date = new Date(),
) {
  const period = resolveReportPeriod(search, now);
  const scope: SupplierSalesScope = { supplierId, range: period, statuses: SOLD };
  const bucket = chartBucketOf(period);
  const [
    profile,
    summary,
    previous,
    series,
    bestByUnits,
    bestByValue,
    marketplaces,
    stores,
    soldOut,
    idle,
  ] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    getSupplierSalesSummary(database, scope),
    getSupplierSalesSummary(database, { ...scope, range: period.previous }),
    getSupplierSalesTimeseries(database, scope, bucket),
    listSupplierProductSales(database, scope, BEST_SELLERS),
    listSupplierProductSales(database, scope, BEST_SELLERS, { sortBy: "value" }),
    listSupplierSalesByMarketplace(database, scope),
    countSupplierSellingStores(database, scope),
    loadSoldOut(supplierId, now),
    listSupplierIdleProducts(database, {
      supplierId,
      since: daysBefore(RECENT_DAYS, now),
      statuses: SOLD,
      limit: SHELF_ROWS,
    }),
  ]);
  // Counts only: what the page showed, for support to compare with a complaint.
  logger.info("supplier_panel.sales_page_loaded", {
    supplierId,
    kind: period.kind,
    orders: summary.orders,
  });
  return {
    supplierName: profile.name,
    summary,
    previous,
    series,
    bucket,
    bestByUnits,
    bestByValue,
    marketplaces: marketplaceShares(marketplaces).map((share) => ({
      ...share,
      name: marketplaceName(share.marketplace),
    })),
    stores,
    soldOut,
    idle,
  };
}
