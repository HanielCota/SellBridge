import type { Database } from "@sellbridge/database";
import {
  claimDueWebhookDeliveries,
  IDEMPOTENCY_KEY_TTL_MILLISECONDS,
  markWebhookAttemptFailed,
  markWebhookDelivered,
  pruneApiEvents,
  pruneIdempotencyKeys,
  type DueWebhookDelivery,
} from "@sellbridge/database/repositories";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { signWebhookPayload, WEBHOOK_SIGNATURE_HEADER } from "@sellbridge/shared/webhook-signature";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { sendWebhookRequest, type SendWebhookRequest } from "../lib/webhook-http.ts";
import { nextWebhookAttemptAt } from "../lib/webhook-retry.ts";
import {
  assertDeliverableWebhookUrl,
  resolveHostWithDns,
  type ResolveHost,
} from "../lib/webhook-url-guard.ts";

export interface WebhookDeliveryDependencies {
  database: Database;
  cipher: TokenCipher;
  /** WEBHOOK_ALLOW_PRIVATE_URLS: development receivers live on localhost. */
  allowPrivateUrls: boolean;
  sendRequest?: SendWebhookRequest;
  resolveHost?: ResolveHost;
  now?: () => Date;
  /** Tests only: claim one tenant's deliveries so parallel test files don't take each other's. */
  tenantId?: string;
}

export interface WebhookDeliverySummary {
  delivered: number;
  failed: number;
}

/** Deliveries sent per run (every 10 s), concurrently: one slow receiver does not stall the rest. */
const BATCH_SIZE = 25;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
/** Longer than a request can take, so a claimed delivery is only retaken if the run died. */
const LEASE_MILLISECONDS = 2 * 60 * 1000;
const EVENT_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
/** Pruning scans by date; once an hour per worker is plenty and keeps the 10 s runs cheap. */
const PRUNE_INTERVAL_MILLISECONDS = 60 * 60 * 1000;
const USER_AGENT = "SellBridge-Webhooks/1.0";

type AttemptResult =
  { ok: true; statusCode: number } | { ok: false; statusCode: number | null; error: string };

/** Node network codes, in the words the integrator reads on the deliveries screen. */
const NETWORK_ERRORS: Readonly<Record<string, string>> = {
  ECONNREFUSED: "Conexão recusada pelo servidor",
  ECONNRESET: "Conexão encerrada pelo servidor",
  ENOTFOUND: "Endereço não encontrado",
  EAI_AGAIN: "Endereço não encontrado",
  ETIMEDOUT: "Tempo esgotado",
  UND_ERR_CONNECT_TIMEOUT: "Tempo esgotado",
};

/**
 * What the deliveries screen shows for a failed attempt: our own messages as written, network
 * failures by kind. Raw Node messages ("connect ECONNREFUSED 10.0.0.5:443") would expose the
 * addresses the endpoint resolves to and the worker's internals.
 */
function deliveryErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.userMessage;
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Tempo esgotado";
  }
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  return (
    (typeof code === "string" ? NETWORK_ERRORS[code] : undefined) ?? "Falha de rede na entrega"
  );
}

async function sendDelivery(
  dependencies: WebhookDeliveryDependencies,
  delivery: DueWebhookDelivery,
  now: Date,
): Promise<AttemptResult> {
  await assertDeliverableWebhookUrl(delivery.endpoint.url, {
    allowPrivate: dependencies.allowPrivateUrls,
    resolveHost: dependencies.resolveHost ?? resolveHostWithDns,
  });
  const { event } = delivery;
  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt.toISOString(),
    data: event.data,
  });
  const signature = signWebhookPayload({
    secret: dependencies.cipher.decrypt(delivery.endpoint.secretEnc),
    timestamp: Math.floor(now.getTime() / 1000),
    body,
  });
  // The address is checked again at connection time (see webhook-http.ts); redirects are
  // never followed, since they would lead past both checks.
  const statusCode = await (dependencies.sendRequest ?? sendWebhookRequest)({
    url: delivery.endpoint.url,
    headers: {
      "content-type": "application/json",
      "user-agent": USER_AGENT,
      [WEBHOOK_SIGNATURE_HEADER]: signature,
      "SellBridge-Event-Id": event.id,
      "SellBridge-Event-Type": event.type,
    },
    body,
    timeoutMilliseconds: REQUEST_TIMEOUT_MILLISECONDS,
    allowPrivateUrls: dependencies.allowPrivateUrls,
  });
  if (statusCode >= 200 && statusCode < 300) {
    return { ok: true, statusCode };
  }
  return { ok: false, statusCode, error: `HTTP ${statusCode}` };
}

/** Any failure (refused URL, network, timeout, bad secret) is one failed attempt, not a crash. */
async function trySendDelivery(
  dependencies: WebhookDeliveryDependencies,
  delivery: DueWebhookDelivery,
  now: Date,
): Promise<AttemptResult> {
  try {
    return await sendDelivery(dependencies, delivery, now);
  } catch (error) {
    return { ok: false, statusCode: null, error: deliveryErrorMessage(error) };
  }
}

/**
 * One delivery whose bookkeeping failed (the database, not the endpoint) must not discard the
 * other results of the batch; its lease expires and it is retried.
 */
async function attemptDeliverySafely(
  dependencies: WebhookDeliveryDependencies,
  delivery: DueWebhookDelivery,
  now: Date,
): Promise<boolean> {
  try {
    return await attemptDelivery(dependencies, delivery, now);
  } catch (error) {
    logger.error("webhook.delivery_bookkeeping_failed", { deliveryId: delivery.id, error });
    return false;
  }
}

async function attemptDelivery(
  dependencies: WebhookDeliveryDependencies,
  delivery: DueWebhookDelivery,
  now: Date,
): Promise<boolean> {
  const result = await trySendDelivery(dependencies, delivery, now);
  if (result.ok) {
    await markWebhookDelivered(dependencies.database, delivery.id, {
      statusCode: result.statusCode,
      now,
    });
    return true;
  }
  const nextAttemptAt = nextWebhookAttemptAt(delivery.attempts + 1, now);
  await markWebhookAttemptFailed(dependencies.database, delivery.id, {
    statusCode: result.statusCode,
    error: result.error,
    nextAttemptAt,
  });
  logger.warn("webhook.delivery_failed", {
    tenantId: delivery.tenantId,
    deliveryId: delivery.id,
    endpointId: delivery.endpoint.id,
    attempt: delivery.attempts + 1,
    statusCode: result.statusCode,
    final: nextAttemptAt === null,
    error: result.error,
  });
  return false;
}

async function pruneExpiredRecords(database: Database, now: Date): Promise<void> {
  const events = await pruneApiEvents(
    database,
    new Date(now.getTime() - EVENT_RETENTION_MILLISECONDS),
  );
  const idempotencyKeys = await pruneIdempotencyKeys(
    database,
    new Date(now.getTime() - IDEMPOTENCY_KEY_TTL_MILLISECONDS),
  );
  if (events > 0 || idempotencyKeys > 0) {
    logger.info("public_api.pruned", { events, idempotencyKeys });
  }
}

/**
 * Sends due outbound webhooks of every tenant (signed POSTs), records each attempt with its
 * retry time, and now and then prunes old events and idempotency keys.
 */
export function createWebhookDeliveryProcessor(dependencies: WebhookDeliveryDependencies) {
  const currentTime = dependencies.now ?? (() => new Date());
  let lastPrunedAt = 0;

  return async function processWebhookDeliveries(): Promise<WebhookDeliverySummary> {
    const now = currentTime();
    if (now.getTime() - lastPrunedAt >= PRUNE_INTERVAL_MILLISECONDS) {
      lastPrunedAt = now.getTime();
      await pruneExpiredRecords(dependencies.database, now);
    }
    const deliveries = await claimDueWebhookDeliveries(dependencies.database, {
      tenantId: dependencies.tenantId,
      now,
      limit: BATCH_SIZE,
      leaseMilliseconds: LEASE_MILLISECONDS,
    });
    const results = await Promise.all(
      deliveries.map(async (delivery) => attemptDeliverySafely(dependencies, delivery, now)),
    );
    const delivered = results.filter(Boolean).length;
    return { delivered, failed: results.length - delivered };
  };
}
