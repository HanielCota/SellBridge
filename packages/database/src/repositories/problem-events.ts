import type { ProblemArea, ProblemService } from "@sellbridge/shared/problem-areas";
import type { CapturedProblem } from "@sellbridge/shared/problem-capture";
import { and, desc, eq, gte, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias, type PgSelect } from "drizzle-orm/pg-core";
import type { Database } from "../client.ts";
import {
  listingTargets,
  organization,
  problemEvents,
  storeConnections,
  user,
} from "../schema/index.ts";

/** One problem as buffered by the recorder: `count` repeats seen since the last write. */
export interface ProblemOccurrence {
  problem: CapturedProblem;
  count: number;
}

/** Repeats of an open problem within this window add to its counter instead of a new row. */
export const PROBLEM_REPEAT_WINDOW_MILLISECONDS = 24 * 60 * 60 * 1000;
/** Problems unseen for this long are deleted. */
export const PROBLEM_RETENTION_DAYS = 30;
/** The table never holds more problems than this; the ones seen longest ago go first. */
export const PROBLEM_MAXIMUM_ROWS = 5000;

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

async function addToOpenProblem(
  database: Database,
  occurrence: ProblemOccurrence,
): Promise<boolean> {
  const { problem, count } = occurrence;
  const windowStart = new Date(problem.occurredAt.getTime() - PROBLEM_REPEAT_WINDOW_MILLISECONDS);
  const open = database
    .select({ id: problemEvents.id })
    .from(problemEvents)
    .where(
      and(
        eq(problemEvents.fingerprint, problem.fingerprint),
        isNull(problemEvents.resolvedAt),
        gte(problemEvents.lastSeenAt, windowStart),
      ),
    )
    .orderBy(desc(problemEvents.lastSeenAt))
    .limit(1);
  const updated = await database
    .update(problemEvents)
    .set({
      occurrences: sql`${problemEvents.occurrences} + ${count}`,
      lastSeenAt: sql`greatest(${problemEvents.lastSeenAt}, ${problem.occurredAt.toISOString()}::timestamptz)`,
      message: problem.message,
      context: problem.context,
      tenantId: sql`coalesce(${problem.tenantId}, ${problemEvents.tenantId})`,
      storeConnectionId: sql`coalesce(${problem.storeConnectionId}, ${problemEvents.storeConnectionId})`,
      listingTargetId: sql`coalesce(${problem.listingTargetId}, ${problemEvents.listingTargetId})`,
    })
    .where(eq(problemEvents.id, sql`(${open})`))
    .returning({ id: problemEvents.id });
  return updated.length > 0;
}

/**
 * Stores what the recorder buffered: a repeat of an open problem seen within the last day adds
 * to its counter, anything else (new, resolved or older) opens a new row.
 */
export async function recordProblems(
  database: Database,
  occurrences: readonly ProblemOccurrence[],
): Promise<void> {
  for (const occurrence of occurrences) {
    const added = await addToOpenProblem(database, occurrence);
    if (added) {
      continue;
    }
    const { problem, count } = occurrence;
    await database.insert(problemEvents).values({
      service: problem.service,
      area: problem.area,
      event: problem.event,
      message: problem.message,
      fingerprint: problem.fingerprint,
      tenantId: problem.tenantId,
      storeConnectionId: problem.storeConnectionId,
      listingTargetId: problem.listingTargetId,
      context: problem.context,
      occurrences: count,
      firstSeenAt: problem.occurredAt,
      lastSeenAt: problem.occurredAt,
    });
  }
}

/** Deletes problems unseen for the retention period, then the oldest beyond the row cap. */
export async function pruneProblemEvents(
  database: Database,
  options: { now: Date; retentionDays?: number; maximumRows?: number },
): Promise<number> {
  const retentionDays = options.retentionDays ?? PROBLEM_RETENTION_DAYS;
  const maximumRows = options.maximumRows ?? PROBLEM_MAXIMUM_ROWS;
  const cutoff = new Date(options.now.getTime() - retentionDays * DAY_MILLISECONDS);
  const expired = await database
    .delete(problemEvents)
    .where(lt(problemEvents.lastSeenAt, cutoff))
    .returning({ id: problemEvents.id });
  const beyondCap = database
    .select({ id: problemEvents.id })
    .from(problemEvents)
    .orderBy(desc(problemEvents.lastSeenAt), desc(problemEvents.id))
    .offset(maximumRows);
  const overflow = await database
    .delete(problemEvents)
    .where(sql`${problemEvents.id} in (${beyondCap})`)
    .returning({ id: problemEvents.id });
  return expired.length + overflow.length;
}

export type ProblemStatus = "open" | "resolved";

export interface ProblemSearch {
  status: ProblemStatus;
  area?: ProblemArea | undefined;
  /** Only problems seen from this moment on. */
  since: Date;
  /** The last item of the previous page. */
  cursor?: { lastSeenAt: Date; id: string } | undefined;
  limit: number;
}

export interface ProblemListItem {
  id: string;
  service: ProblemService;
  area: ProblemArea;
  event: string;
  message: string;
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  /** The reseller or supplier account the problem was about, when known. */
  accountName: string | null;
  /** The account owner's user id, for the link to the admin customer page. */
  accountUserId: string | null;
  storeName: string | null;
}

export interface ProblemPage {
  items: ProblemListItem[];
  nextCursor: { lastSeenAt: Date; id: string } | null;
}

export interface ProblemDetail extends ProblemListItem {
  tenantId: string | null;
  storeConnectionId: string | null;
  listingTargetId: string | null;
  context: Record<string, unknown>;
  resolvedByName: string | null;
}

const directStore = alias(storeConnections, "direct_store");
const targetStore = alias(storeConnections, "target_store");
const resolver = alias(user, "resolver");

const accountTenantId = sql<
  string | null
>`coalesce(${problemEvents.tenantId}, ${directStore.tenantId}, ${listingTargets.tenantId})`;

/** The owner first, then the oldest member: the person the admin customer page is about. */
const accountUserId = sql<string | null>`(
  select "member"."user_id" from "member"
  where "member"."organization_id" = ${organization.id}
  order by ("member"."role" = 'owner') desc, "member"."created_at" asc
  limit 1
)`;

const LIST_COLUMNS = {
  id: problemEvents.id,
  service: problemEvents.service,
  area: problemEvents.area,
  event: problemEvents.event,
  message: problemEvents.message,
  occurrences: problemEvents.occurrences,
  firstSeenAt: problemEvents.firstSeenAt,
  lastSeenAt: problemEvents.lastSeenAt,
  resolvedAt: problemEvents.resolvedAt,
  accountName: organization.name,
  accountUserId,
  storeName: sql<string | null>`coalesce(${directStore.shopName}, ${targetStore.shopName})`,
};

const DETAIL_COLUMNS = {
  ...LIST_COLUMNS,
  tenantId: accountTenantId,
  storeConnectionId: problemEvents.storeConnectionId,
  listingTargetId: problemEvents.listingTargetId,
  context: problemEvents.context,
  resolvedByName: resolver.name,
};

/** Joins what names the account, the store and who resolved, onto a dynamic select. */
function withAccounts<Query extends PgSelect>(query: Query) {
  return query
    .leftJoin(directStore, sql`${directStore.id}::text = ${problemEvents.storeConnectionId}`)
    .leftJoin(listingTargets, sql`${listingTargets.id}::text = ${problemEvents.listingTargetId}`)
    .leftJoin(targetStore, eq(targetStore.id, listingTargets.storeConnectionId))
    .leftJoin(organization, eq(organization.id, accountTenantId))
    .leftJoin(resolver, eq(resolver.id, problemEvents.resolvedById));
}

/** Rows after the previous page's last one, in the list's order (last seen, then id). */
function afterCursor(cursor: ProblemSearch["cursor"]): SQL | undefined {
  if (cursor === undefined) {
    return undefined;
  }
  return or(
    lt(problemEvents.lastSeenAt, cursor.lastSeenAt),
    and(eq(problemEvents.lastSeenAt, cursor.lastSeenAt), lt(problemEvents.id, cursor.id)),
  );
}

function statusCondition(status: ProblemStatus): SQL {
  if (status === "open") {
    return isNull(problemEvents.resolvedAt);
  }
  return isNotNull(problemEvents.resolvedAt);
}

function searchConditions(search: ProblemSearch): SQL | undefined {
  const area = search.area === undefined ? undefined : eq(problemEvents.area, search.area);
  return and(
    statusCondition(search.status),
    area,
    gte(problemEvents.lastSeenAt, search.since),
    afterCursor(search.cursor),
  );
}

/** Problems last seen most recently first, one page at a time. */
export async function listProblemEvents(
  database: Database,
  search: ProblemSearch,
): Promise<ProblemPage> {
  const rows = await withAccounts(database.select(LIST_COLUMNS).from(problemEvents).$dynamic())
    .where(searchConditions(search))
    .orderBy(desc(problemEvents.lastSeenAt), desc(problemEvents.id))
    .limit(search.limit + 1);
  const items = rows.slice(0, search.limit);
  const last = items.at(-1);
  const hasMore = rows.length > search.limit;
  return {
    items,
    nextCursor: hasMore && last !== undefined ? { lastSeenAt: last.lastSeenAt, id: last.id } : null,
  };
}

/** One problem with its context; null when it does not exist (or was pruned). */
export async function getProblemEvent(
  database: Database,
  id: string,
): Promise<ProblemDetail | null> {
  const [row] = await withAccounts(database.select(DETAIL_COLUMNS).from(problemEvents).$dynamic())
    .where(eq(problemEvents.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Marks a problem resolved by `resolvedById`, or open again with null (the undo). Returns false
 * when the problem no longer exists.
 */
export async function setProblemResolved(
  database: Database,
  input: { id: string; resolvedById: string | null; now: Date },
): Promise<boolean> {
  const resolving = input.resolvedById !== null;
  const updated = await database
    .update(problemEvents)
    .set({
      resolvedAt: resolving ? input.now : null,
      resolvedById: input.resolvedById,
    })
    .where(eq(problemEvents.id, input.id))
    .returning({ id: problemEvents.id });
  return updated.length > 0;
}
