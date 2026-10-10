import type { ReportScope } from "@sellbridge/database/repositories";
import { resolvePeriod } from "@sellbridge/shared/period-range";
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
