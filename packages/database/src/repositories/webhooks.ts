import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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

export type RecordWebhookResult = { status: "created"; id: string } | { status: "duplicate" };

/**
 * Stores the raw event exactly once per (marketplace, external id). Marketplaces retry
 * deliveries, so a duplicate is acknowledged without being processed again.
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
      rawPayload: input.rawPayload ?? {},
      signatureValid: input.signatureValid,
      error: input.error ?? null,
      processedAt: input.signatureValid ? null : new Date(),
    })
    .onConflictDoNothing({ target: [webhookEvents.marketplace, webhookEvents.externalEventId] })
    .returning({ id: webhookEvents.id });
  if (!row) {
    return { status: "duplicate" };
  }
  return { status: "created", id: row.id };
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
