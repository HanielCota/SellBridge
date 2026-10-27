import { getAdminReportRows, type AdminReportRows } from "@sellbridge/database/repositories";
import { monthRange, trendMonths, type ReportPeriod } from "@sellbridge/shared/report-period";
import { database } from "@/lib/server/database";
import type { MonthlyReport } from "@/features/report-kit/report-model";
import { buildAdminReport } from "./admin-report-builder";

/** The rows of the period, the one before it and the months of the trend chart. */
export async function loadAdminReportRows(
  period: ReportPeriod,
  now: Date,
): Promise<AdminReportRows> {
  const oldestMonth = trendMonths(period)[0] ?? period.fromDate.slice(0, 7);
  return getAdminReportRows(database, {
    period: { from: period.from, to: period.to },
    previous: { from: period.previous.from, to: period.previous.to },
    trendSince: monthRange(oldestMonth).from,
    now,
  });
}

export async function computeAdminReport(period: ReportPeriod, now: Date): Promise<MonthlyReport> {
  const rows = await loadAdminReportRows(period, now);
  return buildAdminReport({ rows, period, now });
}
