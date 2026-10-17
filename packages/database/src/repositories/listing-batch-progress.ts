import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../client.ts";
import { listingTargets } from "../schema/index.ts";

/** Where the marketplace jobs of one bulk publication stand (item 14.b). */
export interface PublishBatchStatus {
  total: number;
  published: number;
  failed: number;
  /** Queued, running or waiting for an automatic retry. */
  pending: number;
  startedAt: Date | null;
  lastFinishedAt: Date | null;
}

interface BatchTargetRow {
  status: (typeof listingTargets.$inferSelect)["status"];
  createdAt: Date;
  publishedAt: Date | null;
  updatedAt: Date;
}

const EMPTY_BATCH: PublishBatchStatus = {
  total: 0,
  published: 0,
  failed: 0,
  pending: 0,
  startedAt: null,
  lastFinishedAt: null,
};

/** When the job stopped for good, or null while it can still change on its own. */
function finishedAt(row: BatchTargetRow): Date | null {
  if (row.status === "published" || row.status === "paused") {
    return row.publishedAt ?? row.updatedAt;
  }
  if (row.status === "error") {
    return row.updatedAt;
  }
  return null;
}

function earliest(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>(
    (first, date) => (first === null || date < first ? date : first),
    null,
  );
}

function latest(dates: readonly Date[]): Date | null {
  return dates.reduce<Date | null>(
    (last, date) => (last === null || date > last ? date : last),
    null,
  );
}

function summarize(rows: readonly BatchTargetRow[]): PublishBatchStatus {
  const published = rows.filter((row) => row.status === "published" || row.status === "paused");
  const failed = rows.filter((row) => row.status === "error");
  const finishedDates = rows.flatMap((row) => {
    const date = finishedAt(row);
    return date === null ? [] : [date];
  });
  return {
    total: rows.length,
    published: published.length,
    failed: failed.length,
    pending: rows.length - published.length - failed.length,
    startedAt: earliest(rows.map((row) => row.createdAt)),
    lastFinishedAt: latest(finishedDates),
  };
}

/** The tenant's own targets only: ids of another tenant count as nothing. */
export async function getPublishBatchStatus(
  database: Database,
  tenantId: string,
  targetIds: readonly string[],
): Promise<PublishBatchStatus> {
  if (targetIds.length === 0) {
    return EMPTY_BATCH;
  }
  const rows = await database
    .select({
      status: listingTargets.status,
      createdAt: listingTargets.createdAt,
      publishedAt: listingTargets.publishedAt,
      updatedAt: listingTargets.updatedAt,
    })
    .from(listingTargets)
    .where(and(eq(listingTargets.tenantId, tenantId), inArray(listingTargets.id, [...targetIds])));
  return summarize(rows);
}
