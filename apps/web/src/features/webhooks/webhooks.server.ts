import { recordWebhookEvent } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { marketplaceSchema } from "@sellbridge/shared/schemas";
import { database } from "@/lib/server/database";
import { connectors } from "@/lib/server/marketplaces";
import { enqueueWebhookEvent } from "@/lib/server/queues";

const MAX_BODY_BYTES = 64 * 1024;

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
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return reply(413, { error: "payload muito grande" });
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return reply(413, { error: "payload muito grande" });
  }

  const verification = await connectors[marketplace.data].verifyWebhook({
    headers: request.headers,
    rawBody,
  });
  if (!verification.valid) {
    await recordWebhookEvent(database, {
      marketplace: marketplace.data,
      externalEventId: null,
      topic: null,
      rawPayload: verification.payload,
      signatureValid: false,
      error: verification.reason,
    });
    logger.warn("webhook.rejected", { marketplace: marketplace.data, reason: verification.reason });
    return reply(401, { error: "notificação inválida" });
  }

  const recorded = await recordWebhookEvent(database, {
    marketplace: marketplace.data,
    externalEventId: verification.event.externalEventId,
    topic: verification.event.topic,
    rawPayload: verification.event.payload,
    signatureValid: true,
  });
  if (recorded.status === "duplicate") {
    return reply(200, { status: "duplicado" });
  }
  await enqueueWebhookEvent(recorded.id);
  return reply(200, { status: "recebido" });
}
