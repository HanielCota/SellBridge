import { and, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { reportSnapshots } from "../schema/index.ts";

export type ReportSnapshotScope = "seller" | "supplier" | "admin";

export interface ReportSnapshotKey {
  scope: ReportSnapshotScope;
  /** The tenant, the supplier, or "platform" for the admin report. */
  ownerId: string;
  /** `YYYY-MM`. */
  month: string;
}

export interface StoredReportSnapshot {
  payload: unknown;
  capturedAt: Date;
}

export async function findReportSnapshot(
  database: Database,
  key: ReportSnapshotKey,
): Promise<StoredReportSnapshot | null> {
  const [row] = await database
    .select({ payload: reportSnapshots.payload, capturedAt: reportSnapshots.capturedAt })
    .from(reportSnapshots)
    .where(
      and(
        eq(reportSnapshots.scope, key.scope),
        eq(reportSnapshots.ownerId, key.ownerId),
        eq(reportSnapshots.month, key.month),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Keeps the closed month's numbers the first time they are computed. Two requests racing for the
 * same month both read back the one row that won, so every reader sees the same numbers.
 */
export async function saveReportSnapshot(
  database: Database,
  key: ReportSnapshotKey,
  payload: unknown,
): Promise<StoredReportSnapshot> {
  await database
    .insert(reportSnapshots)
    .values({ ...key, payload })
    .onConflictDoNothing({
      target: [reportSnapshots.scope, reportSnapshots.ownerId, reportSnapshots.month],
    });
  const stored = await findReportSnapshot(database, key);
  if (stored === null) {
    throw new Error(`Report snapshot ${key.scope}/${key.month} was not saved`);
  }
  return stored;
}
