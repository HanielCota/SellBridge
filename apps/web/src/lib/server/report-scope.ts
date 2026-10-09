import type { ReportScope } from "@sellbridge/db/repositories";
import { resolvePeriod, type PeriodSearch } from "@sellbridge/shared/schemas";
import { env } from "./env.ts";

/** Shared by the dashboard, the financial page and the CSV export (server only). */
export function buildReportScope(tenantId: string, search: PeriodSearch, now = new Date()) {
  const period = resolvePeriod(search, now);
  const scope: ReportScope = {
    tenantId,
    range: { from: period.from, to: period.to },
    storeConnectionId: search.store,
    platformFeeBps: env.PLATFORM_FEE_BPS,
  };
  return { period, scope };
}
