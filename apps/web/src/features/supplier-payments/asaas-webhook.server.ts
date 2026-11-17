import { findPaymentAccountsByProviderAccount } from "@sellbridge/database/repositories";
import {
  ASAAS_WEBHOOK_TOKEN_HEADER,
  isValidAsaasWebhookToken,
  readAsaasWebhookEvent,
  refreshAsaasReview,
  syncAsaasCharge,
  type AsaasContext,
  type AsaasWebhookEvent,
} from "@sellbridge/payments/asaas";
import { parseJsonText, readTextWithin } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { asaasContext } from "./asaas.server";

const MAX_BODY_BYTES = 64 * 1024;

function reply(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleEvent(context: AsaasContext, event: AsaasWebhookEvent): Promise<void> {
  if (event.kind === "ignored") {
    return;
  }
  if (event.accountId === null) {
    logger.warn("asaas.notice_without_account", { eventId: event.eventId });
    return;
  }
  const accounts = await findPaymentAccountsByProviderAccount(database, {
    provider: "asaas",
    providerAccountId: event.accountId,
  });
  for (const account of accounts) {
    if (event.kind === "account_status") {
      await refreshAsaasReview(context, account);
      continue;
    }
    const result = await syncAsaasCharge(context, { account, chargeId: event.paymentId });
    if (result.kind === "ignored") {
      logger.info("asaas.notice_ignored", { eventId: event.eventId, reason: result.reason });
    }
  }
}

/**
 * POST /api/webhooks/asaas: a notice from one of the suppliers' Asaas accounts. Its token is
 * checked first; the charge or the account is then read back from Asaas (the notice only names
 * it). Every accepted notice answers 200, even when Asaas could not be read back: Asaas pauses a
 * webhook after 15 failures in a row, and the reconciliation job reads every open payment anyway.
 */
export async function handleAsaasWebhook(request: Request): Promise<Response> {
  const context = asaasContext();
  if (context === null) {
    return reply(404, { error: "pagamento protegido pelo Asaas desligado" });
  }
  const token = request.headers.get(ASAAS_WEBHOOK_TOKEN_HEADER);
  if (!isValidAsaasWebhookToken(token, context.settings.webhookToken)) {
    logger.warn("asaas.notice_unauthorized", {});
    return reply(401, { error: "token inválido" });
  }
  const text = await readTextWithin(request, MAX_BODY_BYTES);
  const event = text === null ? null : readAsaasWebhookEvent(parseJsonText(text));
  if (event === null) {
    logger.warn("asaas.notice_unreadable", {});
    return reply(200, { status: "ignorado" });
  }
  try {
    await handleEvent(context, event);
  } catch (error) {
    logger.warn("asaas.notice_deferred", { eventId: event.eventId, error });
  }
  return reply(200, { status: "recebido" });
}
