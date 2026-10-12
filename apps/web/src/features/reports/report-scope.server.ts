import type { ReportScope } from "@sellbridge/database/repositories";
import {
  dayRangeWithin,
  resolvePeriod,
  type ResolvedPeriod,
} from "@sellbridge/shared/period-range";
import type { PeriodSearch } from "@sellbridge/shared/schemas";
import { environment } from "@/lib/server/environment";

/** Shared by the dashboard, the financial page and the CSV export (server only). */
export function buildReportScope(tenantId: string, search: PeriodSearch, now = new Date()) {
  const period = resolvePeriod(search, now);
  const scope: ReportScope = {
    tenantId,
    range: { from: period.from, to: period.to },
    storeConnectionId: search.store,
    platformFeeBasisPoints: environment.PLATFORM_FEE_BASIS_POINTS,
  };
  return { period, scope };
}

/**
 * The scope cut down to one day the user picked on the profit chart. A day outside the period
 * (an old link, a hand-edited URL) is ignored, and `day` comes back null so the page knows.
 */
export function narrowToDay(
  scope: ReportScope,
  period: ResolvedPeriod,
  day: string | undefined,
): { scope: ReportScope; day: string | null } {
  const range = dayRangeWithin(period, day);
  if (!range || !day) {
    return { scope, day: null };
  }
  return { scope: { ...scope, range }, day };
}
