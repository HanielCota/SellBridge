import {
  ASAAS_WEBHOOK_TOKEN_HEADER,
  asaasSettingsFrom,
  isValidAsaasWebhookToken,
} from "@sellbridge/payments/asaas";
import { parseJsonText, readTextWithin } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { environment } from "@/lib/server/environment";
import { billingEnabled } from "./billing-config.server";
import { syncBillingSubscription, syncUpgradeCharge } from "./billing-sync.server";

const MAX_BODY_BYTES = 64 * 1024;
const UPGRADE_REFERENCE = "upgrade:";

/** The parts of a notice from SellBridge's own Asaas account that the plans read. */
const billingNoticeSchema = z.object({
  /** Unique per event: a notice delivered twice carries the same id. */
  id: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  payment: z
    .object({
      id: z.string().min(1).max(200),
      subscription: z.string().max(200).nullish(),
      externalReference: z.string().max(200).nullish(),
    })
    .nullish(),
  subscription: z.object({ id: z.string().min(1).max(200) }).nullish(),
});
type BillingNotice = z.infer<typeof billingNoticeSchema>;

function reply(status: number, body: Record<string, string>): Response {
  return Response.json(body, { status });
}

async function handleNotice(notice: BillingNotice): Promise<void> {
  const { payment } = notice;
  if (payment != null && payment.externalReference?.startsWith(UPGRADE_REFERENCE) === true) {
    await syncUpgradeCharge({ chargeId: payment.id, eventId: notice.id });
    return;
  }
  const subscriptionId = payment?.subscription ?? notice.subscription?.id ?? null;
  if (subscriptionId === null) return;
  await syncBillingSubscription({ subscriptionId, eventId: notice.id });
}

/**
 * POST /api/webhooks/asaas-assinatura: a payment or subscription notice from SellBridge's own
 * Asaas account (the plans' monthly fee). The token is checked first; the subscription is then
 * read back from Asaas. Every accepted notice answers 200: Asaas pauses a webhook after 15
 * failures in a row, and the subscription page reads Asaas again whenever a payment is due.
 */
export async function handleBillingWebhook(request: Request): Promise<Response> {
  const settings = asaasSettingsFrom(environment);
  if (settings === null || !billingEnabled()) {
    return reply(404, { error: "cobrança dos planos desligada" });
  }
  const token = request.headers.get(ASAAS_WEBHOOK_TOKEN_HEADER);
  if (!isValidAsaasWebhookToken(token, settings.webhookToken)) {
    logger.warn("billing.notice_unauthorized", {});
    return reply(401, { error: "token inválido" });
  }
  const text = await readTextWithin(request, MAX_BODY_BYTES);
  const parsed = text === null ? null : billingNoticeSchema.safeParse(parseJsonText(text));
  if (parsed?.success !== true) {
    logger.warn("billing.notice_unreadable", {});
    return reply(200, { status: "ignorado" });
  }
  try {
    await handleNotice(parsed.data);
  } catch (error) {
    logger.error("billing.notice_deferred", { eventId: parsed.data.id, error });
  }
  return reply(200, { status: "recebido" });
}
