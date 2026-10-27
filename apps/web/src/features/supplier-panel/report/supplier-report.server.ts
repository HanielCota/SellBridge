import {
  getSupplierPanelProfile,
  listSupplierOutOfStockListed,
  listSupplierRejectedProducts,
  listSupplierReportReviews,
  listSupplierReportShipments,
  summarizeSupplierCatalog,
} from "@sellbridge/database/repositories";
import {
  monthRange,
  resolveReportPeriod,
  trendMonths,
  type ReportPeriod,
} from "@sellbridge/shared/report-period";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import type { ServedReport } from "@/features/report-kit/report-model";
import { serveMonthlyReport } from "@/features/report-kit/report-snapshot.server";
import { database } from "@/lib/server/database";
import { buildSupplierReport } from "./supplier-report-builder";
import type { SupplierReportInput } from "./supplier-report-input";

/** The earliest instant the report reads: the first trend month or the previous window. */
function readSince(period: ReportPeriod): Date {
  const [firstMonth] = trendMonths(period);
  const trendStart = firstMonth === undefined ? period.previous.from : monthRange(firstMonth).from;
  return new Date(Math.min(trendStart.getTime(), period.previous.from.getTime()));
}

async function loadReportInput(
  supplierId: string,
  period: ReportPeriod,
  now: Date,
): Promise<SupplierReportInput> {
  const since = readSince(period);
  const [supplier, shipments, reviews, summary, outOfStockListed, rejected] = await Promise.all([
    getSupplierPanelProfile(database, supplierId),
    listSupplierReportShipments(database, { supplierId, since, until: period.to }),
    listSupplierReportReviews(database, {
      supplierId,
      since: period.previous.from,
      until: period.to,
    }),
    summarizeSupplierCatalog(database, supplierId),
    listSupplierOutOfStockListed(database, supplierId),
    listSupplierRejectedProducts(database, supplierId),
  ]);
  return {
    period,
    now,
    supplier,
    shipments,
    reviews,
    catalog: { ...summary, outOfStockListed, rejected },
  };
}

/** The supplier's report of the period: a closed month comes from its kept snapshot. */
export async function loadSupplierReport(input: {
  supplierId: string;
  search: ReportPeriodSearch;
}): Promise<ServedReport> {
  const now = new Date();
  const period = resolveReportPeriod(input.search, now);
  return serveMonthlyReport({
    scope: "supplier",
    ownerId: input.supplierId,
    period,
    now,
    compute: async () => buildSupplierReport(await loadReportInput(input.supplierId, period, now)),
  });
}
