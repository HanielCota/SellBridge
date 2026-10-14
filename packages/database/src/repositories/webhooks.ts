import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { Database } from "../client.ts";
import { storeConnections, webhookEvents } from "../schema/index.ts";
import type { Marketplace } from "./stores.ts";

export interface RecordWebhookInput {
  marketplace: Marketplace;
  /** Null when the payload could not be parsed; a synthetic id is generated for auditing. */
  externalEventId: string | null;
  topic: string | null;
  rawPayload: unknown;
  signatureValid: boolean;
  error?: string | undefined;
}

export type RecordWebhookResult =
  | { status: "created"; id: string }
  /** `pending`: the stored copy was never processed, so the caller should enqueue it again. */
  | { status: "duplicate"; id: string; pending: boolean };

async function findStoredEvent(database: Database, input: RecordWebhookInput) {
  if (input.externalEventId === null) {
    return null;
  }
  const [row] = await database
    .select({ id: webhookEvents.id, processedAt: webhookEvents.processedAt })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.marketplace, input.marketplace),
        eq(webhookEvents.externalEventId, input.externalEventId),
      ),
    );
  return row ?? null;
}

/**
 * Stores the raw event exactly once per (marketplace, external id). Marketplaces retry
 * deliveries: a duplicate is acknowledged, and reported as pending while the stored copy
 * is unprocessed (its first enqueue may have been lost).
 */
export async function recordWebhookEvent(
  database: Database,
  input: RecordWebhookInput,
): Promise<RecordWebhookResult> {
  const [row] = await database
    .insert(webhookEvents)
    .values({
      marketplace: input.marketplace,
      externalEventId: input.externalEventId ?? `invalid:${randomUUID()}`,
      topic: input.topic ?? "unknown",
      // A rejected event keeps only why it was rejected: anyone can post to the route, and
      // storing their 64 KB bodies would let them grow the table at will.
      rawPayload: input.signatureValid ? (input.rawPayload ?? {}) : {},
      signatureValid: input.signatureValid,
      error: input.error ?? null,
      processedAt: input.signatureValid ? null : new Date(),
    })
    .onConflictDoNothing({ target: [webhookEvents.marketplace, webhookEvents.externalEventId] })
    .returning({ id: webhookEvents.id });
  if (row) {
    return { status: "created", id: row.id };
  }
  const stored = await findStoredEvent(database, input);
  if (!stored) {
    throw new Error("Evento de webhook duplicado não encontrado");
  }
  return { status: "duplicate", id: stored.id, pending: stored.processedAt === null };
}

/**
 * Valid events still unprocessed and received inside the window, oldest first: their job was
 * lost or ran out of retries. Events older than the window are left for manual inspection.
 */
export async function findUnprocessedWebhookEvents(
  database: Database,
  window: { receivedAfter: Date; receivedBefore: Date; limit: number },
): Promise<string[]> {
  const rows = await database
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        isNull(webhookEvents.processedAt),
        eq(webhookEvents.signatureValid, true),
        gt(webhookEvents.receivedAt, window.receivedAfter),
        lt(webhookEvents.receivedAt, window.receivedBefore),
      ),
    )
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(window.limit);
  return rows.map((row) => row.id);
}

export async function getWebhookEvent(database: Database, id: string) {
  const row = await database.query.webhookEvents.findFirst({ where: eq(webhookEvents.id, id) });
  return row ?? null;
}

export async function markWebhookProcessed(
  database: Database,
  id: string,
  note: string | null = null,
): Promise<void> {
  await database
    .update(webhookEvents)
    .set({ processedAt: new Date(), error: note })
    .where(eq(webhookEvents.id, id));
}

export async function markWebhookFailed(
  database: Database,
  id: string,
  error: string,
): Promise<void> {
  await database.update(webhookEvents).set({ error }).where(eq(webhookEvents.id, id));
}

/**
 * A store of the shop that lost its access (token expired or refused) and can come back:
 * its sales must wait for the reconnection instead of being dropped.
 */
export async function findStoreAwaitingReconnection(
  database: Database,
  marketplace: Marketplace,
  externalShopId: string,
) {
  const row = await database.query.storeConnections.findFirst({
    where: and(
      eq(storeConnections.marketplace, marketplace),
      eq(storeConnections.externalShopId, externalShopId),
      inArray(storeConnections.status, ["expired", "error"]),
    ),
    columns: { id: true },
  });
  return row ?? null;
}

/** Webhooks identify the shop, not the tenant: resolve the connected store across tenants. */
export async function findConnectedStoreByShop(
  database: Database,
  marketplace: Marketplace,
  externalShopId: string,
) {
  const row = await database.query.storeConnections.findFirst({
    where: and(
      eq(storeConnections.marketplace, marketplace),
      eq(storeConnections.externalShopId, externalShopId),
      eq(storeConnections.status, "connected"),
    ),
  });
  return row ?? null;
}

/**
 * Deletes events finished (processed or rejected) before `before`, at most `limit` at a time:
 * the table only needs recent events for duplicates and inspection, and grows with every
 * notification otherwise. Unprocessed events are never deleted. Returns how many went.
 */
export async function pruneWebhookEvents(
  database: Database,
  window: { before: Date; limit: number },
): Promise<number> {
  const oldest = database
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(lt(webhookEvents.receivedAt, window.before), isNotNull(webhookEvents.processedAt)))
    .limit(window.limit);
  const deleted = await database
    .delete(webhookEvents)
    .where(inArray(webhookEvents.id, oldest))
    .returning({ id: webhookEvents.id });
  return deleted.length;
}
