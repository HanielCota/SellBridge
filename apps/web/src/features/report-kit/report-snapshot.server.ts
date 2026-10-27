import {
  findReportSnapshot,
  saveReportSnapshot,
  type ReportSnapshotScope,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import type { ReportPeriod } from "@sellbridge/shared/report-period";
import { database } from "@/lib/server/database";
import type { MonthlyReport, ServedReport } from "./report-model";
import { parseStoredReport } from "./report-schema";

interface SnapshotInput {
  scope: ReportSnapshotScope;
  ownerId: string;
  period: ReportPeriod;
  now: Date;
  compute: () => Promise<MonthlyReport>;
}

/**
 * A closed month is computed once and kept: later refunds, reopened tickets or edited orders
 * no longer move its numbers. A partial month or a custom range is always computed live.
 */
export async function serveMonthlyReport(input: SnapshotInput): Promise<ServedReport> {
  const generatedAt = input.now.toISOString();
  if (input.period.kind !== "month" || input.period.status !== "closed" || !input.period.month) {
    return { report: await input.compute(), savedAt: null, generatedAt };
  }
  const key = { scope: input.scope, ownerId: input.ownerId, month: input.period.month };
  const stored = await findReportSnapshot(database, key);
  const storedReport = stored === null ? null : parseStoredReport(stored.payload);
  if (stored !== null && storedReport !== null) {
    return { report: storedReport, savedAt: stored.capturedAt.toISOString(), generatedAt };
  }
  const report = await input.compute();
  if (stored !== null) {
    // An older shape: shown fresh, the stored month stays as it was kept.
    logger.warn("report.snapshot_outdated", { scope: key.scope, month: key.month });
    return { report, savedAt: null, generatedAt };
  }
  const saved = await saveReportSnapshot(database, key, report);
  return {
    report: parseStoredReport(saved.payload) ?? report,
    savedAt: saved.capturedAt.toISOString(),
    generatedAt,
  };
}
