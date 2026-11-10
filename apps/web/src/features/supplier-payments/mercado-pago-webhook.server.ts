import { findPaymentAccountsByProviderAccount } from "@sellbridge/database/repositories";
import { parseJsonText, readTextWithin } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { database } from "@/lib/server/database";
import {
  mercadoPagoSettings,
  PaymentAccountUnavailableError,
  syncMercadoPagoPayment,
} from "./mercado-pago-accounts.server";
import { isMercadoPagoError } from "./mercado-pago-client.server";
import { isValidMercadoPagoSignature } from "./mercado-pago-signature";

const MAX_BODY_BYTES = 64 * 1024;
const NOT_FOUND = 404;

const noticeSchema = z.object({
  type: z.string().min(1).max(100),
  user_id: z.union([z.number().int(), z.string().min(1).max(50)]),
  data: z.object({ id: z.union([z.number().int(), z.string().min(1).max(100)]) }),
});

function reply(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * POST /api/webhooks/mercado-pago: a payment notice for one of the linked supplier accounts.
 * The signature is checked first; then the payment is read back from Mercado Pago (the notice
 * only names it) and recorded on its parcel. Repeated notices change nothing, and a failure to
 * reach Mercado Pago answers 500 so it sends the notice again.
 */
export async function handleMercadoPagoWebhook(request: Request): Promise<Response> {
  const settings = mercadoPagoSettings();
  if (settings === null) {
    return reply(404, { error: "pagamento pelo Mercado Pago desligado" });
  }
  const rawBody = await readTextWithin(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return reply(413, { error: "payload muito grande" });
  }
  const notice = noticeSchema.safeParse(parseJsonText(rawBody));
  const queryDataId = new URL(request.url).searchParams.get("data.id");
  const dataId = queryDataId ?? (notice.success ? String(notice.data.data.id) : null);
  const signed = isValidMercadoPagoSignature({
    secret: settings.webhookSecret,
    signatureHeader: request.headers.get("x-signature"),
    requestIdHeader: request.headers.get("x-request-id"),
    dataId,
  });
  if (!signed) {
    logger.warn("mercado_pago.webhook_rejected", { reason: "signature" });
    return reply(401, { error: "notificação inválida" });
  }
  if (!notice.success) {
    return reply(400, { error: "notificação inválida" });
  }
  // The signature covers the address's data.id only: the body must name the same payment.
  if (queryDataId !== null && queryDataId !== String(notice.data.data.id)) {
    logger.warn("mercado_pago.webhook_rejected", { reason: "data_id_mismatch" });
    return reply(400, { error: "notificação inválida" });
  }
  if (notice.data.type !== "payment") {
    return reply(200, { status: "ignorada" });
  }
  return processPaymentNotice({
    accountId: String(notice.data.user_id),
    providerPaymentId: String(notice.data.data.id),
  });
}

async function processPaymentNotice(input: {
  accountId: string;
  providerPaymentId: string;
}): Promise<Response> {
  const settings = mercadoPagoSettings();
  if (settings === null) {
    return reply(404, { error: "pagamento pelo Mercado Pago desligado" });
  }
  const accounts = await findPaymentAccountsByProviderAccount(database, {
    provider: "mercado_pago",
    providerAccountId: input.accountId,
  });
  const linked = accounts.filter((account) => account.status === "connected");
  if (linked.length === 0) {
    logger.info("mercado_pago.webhook_ignored", { reason: "no_linked_account" });
    return reply(200, { status: "ignorada" });
  }
  try {
    for (const account of linked) {
      const result = await syncMercadoPagoPayment({
        settings,
        account,
        providerPaymentId: input.providerPaymentId,
      });
      if (result.kind === "applied") {
        return reply(200, { status: "registrada" });
      }
    }
    return reply(200, { status: "ignorada" });
  } catch (error) {
    if (isMercadoPagoError(error) && error.status === NOT_FOUND) {
      return reply(200, { status: "ignorada" });
    }
    if (error instanceof PaymentAccountUnavailableError) {
      logger.warn("mercado_pago.webhook_account_unavailable", { error });
      return reply(200, { status: "ignorada" });
    }
    logger.error("mercado_pago.webhook_failed", { error });
    return reply(500, { error: "tente de novo" });
  }
}
