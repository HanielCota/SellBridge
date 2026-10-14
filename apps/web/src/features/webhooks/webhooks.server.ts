import { recordWebhookEvent, type RecordWebhookInput } from "@sellbridge/database/repositories";
import { withDeadline } from "@sellbridge/shared/deadline";
import { readTextWithin } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { marketplaceSchema } from "@sellbridge/shared/schemas";
import { database } from "@/lib/server/database";
import { withoutNul } from "@/lib/server/nul-character";
import { connectors } from "@/lib/server/marketplaces";
import { enqueueWebhookEvent } from "@/lib/server/queues";

const MAX_BODY_BYTES = 64 * 1024;
/**
 * Mercado Livre wants the 200 within 500 ms. While Redis is down the enqueue would hang on
 * ioredis retries, so it gets a deadline: the event is already stored, and the worker's
 * sweeper enqueues it again if this enqueue never lands.
 */
const ENQUEUE_DEADLINE_MILLISECONDS = 300;

function reply(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST /api/webhooks/:marketplace
 * 1. validates the signature/origin through the connector,
 * 2. stores the raw event once (idempotent by marketplace + event id),
 * 3. enqueues processing and answers immediately (Mercado Livre requires 200 in 500 milliseconds).
 */
export async function handleWebhook(request: Request, marketplaceParam: string | undefined) {
  const marketplace = marketplaceSchema.safeParse(marketplaceParam);
  if (!marketplace.success) {
    return reply(404, { error: "marketplace desconhecido" });
  }
  const rawBody = await readTextWithin(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return reply(413, { error: "payload muito grande" });
  }

  const verification = await connectors[marketplace.data].verifyWebhook({
    headers: request.headers,
    rawBody,
  });
  if (!verification.valid) {
    // Logged, not stored: the endpoint is public, and storing every forged or garbage post
    // would let anyone grow the events table without limit.
    logger.warn("webhook.rejected", { marketplace: marketplace.data, reason: verification.reason });
    return reply(401, { error: "notificação inválida" });
  }

  return acknowledgeValidEvent({
    marketplace: marketplace.data,
    externalEventId: verification.event.externalEventId,
    topic: verification.event.topic,
    rawPayload: withoutNul(verification.event.payload),
    signatureValid: true,
  });
}

/** Logs instead of failing the reply: the stored event is recovered by the worker's sweeper. */
async function enqueueWithinDeadline(webhookEventId: string): Promise<void> {
  try {
    await withDeadline(
      enqueueWebhookEvent(webhookEventId),
      ENQUEUE_DEADLINE_MILLISECONDS,
      "enqueue do webhook",
    );
  } catch (error) {
    logger.error("webhook.enqueue_failed", { webhookEventId, error });
  }
}

/**
 * Stores a verified event and enqueues it. A duplicate still unprocessed is enqueued again:
 * its first enqueue may have been lost, and the job id keeps a live job from running twice.
 */
async function acknowledgeValidEvent(input: RecordWebhookInput): Promise<Response> {
  const recorded = await recordWebhookEvent(database, input);
  if (recorded.status === "duplicate" && !recorded.pending) {
    return reply(200, { status: "duplicado" });
  }
  await enqueueWithinDeadline(recorded.id);
  return reply(200, { status: recorded.status === "created" ? "recebido" : "duplicado" });
}
