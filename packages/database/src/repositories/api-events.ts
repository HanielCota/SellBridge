import type { ApiEventData, ApiEventType } from "@sellbridge/shared/public-api";
import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { Database, DatabaseExecutor } from "../client.ts";
import { apiEvents, webhookDeliveries, webhookEndpoints } from "../schema/index.ts";

export interface ApiEventRecord {
  id: string;
  sequence: number;
  type: string;
  data: unknown;
  createdAt: Date;
}

/**
 * Events younger than this are held back. Sequences are taken when a transaction inserts but
 * become visible when it commits, so a slow transaction can surface a lower sequence after a
 * higher one was read; a client polling with `after` would skip it. Transactions here take
 * milliseconds, so a few seconds of delay closes that gap.
 */
const EVENT_SETTLE_SECONDS = 5;
/** Longest lock wait after an event is written; kept below `EVENT_SETTLE_SECONDS`. */
const EVENT_LOCK_TIMEOUT_SECONDS = 3;

/**
 * Records an event and queues one delivery per webhook endpoint subscribed to it. Pass the
 * transaction that made the change, so the event exists exactly when the change does.
 */
export async function recordApiEvent<TType extends ApiEventType>(
  executor: DatabaseExecutor,
  event: { tenantId: string; type: TType; data: ApiEventData<TType> },
): Promise<string> {
  // Dated when the sequence is taken, not when the transaction began (`now()`): a transaction
  // that waited on a lock before this insert would otherwise look settled the moment it commits.
  const [created] = await executor
    .insert(apiEvents)
    .values({
      tenantId: event.tenantId,
      type: event.type,
      data: event.data,
      createdAt: sql`clock_timestamp()`,
    })
    .returning({ id: apiEvents.id });
  if (!created) {
    throw new Error("Não foi possível gravar o evento");
  }
  // From here to the commit the sequence is taken but invisible. A lock wait longer than the
  // settle window would let a client read a higher sequence first and skip this one for good.
  await executor.execute(sql.raw(`set local lock_timeout = '${EVENT_LOCK_TIMEOUT_SECONDS}s'`));
  await executor.execute(sql`
    insert into ${webhookDeliveries} (tenant_id, endpoint_id, event_id)
    select ${webhookEndpoints.tenantId}, ${webhookEndpoints.id}, ${created.id}::uuid
    from ${webhookEndpoints}
    where ${webhookEndpoints.tenantId} = ${event.tenantId}
      and ${webhookEndpoints.disabledAt} is null
      and (cardinality(${webhookEndpoints.eventTypes}) = 0
        or ${event.type} = any(${webhookEndpoints.eventTypes}))
    on conflict do nothing
  `);
  return created.id;
}

/** Events after `afterSequence`, oldest first: a client keeps the last sequence it read. */
export async function listApiEvents(
  database: Database,
  tenantId: string,
  query: { afterSequence: number; limit: number; types?: readonly string[] | undefined },
): Promise<ApiEventRecord[]> {
  const conditions = [
    eq(apiEvents.tenantId, tenantId),
    gt(apiEvents.sequence, query.afterSequence),
    sql`${apiEvents.createdAt} < now() - make_interval(secs => ${EVENT_SETTLE_SECONDS})`,
  ];
  if (query.types && query.types.length > 0) {
    conditions.push(inArray(apiEvents.type, [...query.types]));
  }
  return database
    .select({
      id: apiEvents.id,
      sequence: apiEvents.sequence,
      type: apiEvents.type,
      data: apiEvents.data,
      createdAt: apiEvents.createdAt,
    })
    .from(apiEvents)
    .where(and(...conditions))
    .orderBy(asc(apiEvents.sequence))
    .limit(query.limit);
}

/** Events (and their deliveries) are kept for a while, then pruned by the worker. */
/** Rows deleted per statement: each delete stays short instead of locking a month at once. */
const PRUNE_BATCH_SIZE = 5000;
/**
 * A run stops here; anything left waits for the next hourly run. 200 batches is 1 000 000 events
 * an hour: at 20 (100 000 an hour) a few hundred thousand orders a day outgrew the pruning.
 */
const PRUNE_MAX_BATCHES = 200;

export async function pruneApiEvents(database: Database, before: Date): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch += 1) {
    const expired = database
      .select({ id: apiEvents.id })
      .from(apiEvents)
      .where(lt(apiEvents.createdAt, before))
      .limit(PRUNE_BATCH_SIZE);
    const deleted = await database
      .delete(apiEvents)
      .where(inArray(apiEvents.id, expired))
      .returning({ id: apiEvents.id });
    total += deleted.length;
    if (deleted.length < PRUNE_BATCH_SIZE) {
      return total;
    }
  }
  return total;
}
