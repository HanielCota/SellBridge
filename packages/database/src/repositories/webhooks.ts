import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
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

/** Where a page of the sweep stopped: the last event it returned. */
export interface UnprocessedEventCursor {
  readonly receivedAt: Date;
  readonly id: string;
}

/**
 * Valid events still unprocessed and received inside the window, oldest first: their job was
 * lost or ran out of retries. Events older than the window are left for manual inspection.
 * Paged by `after` (received time, then id), so events that stay unprocessed (a marketplace that
 * keeps failing) cannot fill every page and keep newer ones from being swept before they age out.
 */
export async function findUnprocessedWebhookEvents(
  database: Database,
  window: {
    receivedAfter: Date;
    receivedBefore: Date;
    limit: number;
    after?: UnprocessedEventCursor | undefined;
  },
): Promise<UnprocessedEventCursor[]> {
  const after = window.after;
  return database
    .select({ id: webhookEvents.id, receivedAt: webhookEvents.receivedAt })
    .from(webhookEvents)
    .where(
      and(
        isNull(webhookEvents.processedAt),
        eq(webhookEvents.signatureValid, true),
        gt(webhookEvents.receivedAt, window.receivedAfter),
        lt(webhookEvents.receivedAt, window.receivedBefore),
        after === undefined
          ? undefined
          : or(
              gt(webhookEvents.receivedAt, after.receivedAt),
              and(eq(webhookEvents.receivedAt, after.receivedAt), gt(webhookEvents.id, after.id)),
            ),
      ),
    )
    .orderBy(asc(webhookEvents.receivedAt), asc(webhookEvents.id))
    .limit(window.limit);
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
 * A store of the shop that lost its access (token expired or refused) and can come back: its
 * sales are read from the marketplace once it reconnects. `connectedAt` is its first connection,
 * so that reading never reaches sales from before the store was ours.
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
    columns: { id: true, connectedAt: true },
  });
  return row ?? null;
}

/** The store a reconnection catch-up reads from, while it is still connected. */
export async function findConnectedStoreById(database: Database, storeConnectionId: string) {
  const row = await database.query.storeConnections.findFirst({
    where: and(
      eq(storeConnections.id, storeConnectionId),
      eq(storeConnections.status, "connected"),
    ),
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
    // The partial unique index keeps one live connection per shop (connecting a shop already
    // live in another organization is refused); the order only guards rows made before it.
    orderBy: [desc(storeConnections.connectedAt)],
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
