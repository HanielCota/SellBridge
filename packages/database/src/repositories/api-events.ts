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
 * Records an event and queues one delivery per webhook endpoint subscribed to it. Pass the
 * transaction that made the change, so the event exists exactly when the change does.
 */
export async function recordApiEvent<TType extends ApiEventType>(
  executor: DatabaseExecutor,
  event: { tenantId: string; type: TType; data: ApiEventData<TType> },
): Promise<string> {
  const [created] = await executor
    .insert(apiEvents)
    .values({ tenantId: event.tenantId, type: event.type, data: event.data })
    .returning({ id: apiEvents.id });
  if (!created) {
    throw new Error("Não foi possível gravar o evento");
  }
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
export async function pruneApiEvents(database: Database, before: Date): Promise<number> {
  const deleted = await database
    .delete(apiEvents)
    .where(lt(apiEvents.createdAt, before))
    .returning({ id: apiEvents.id });
  return deleted.length;
}
