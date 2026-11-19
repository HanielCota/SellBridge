import {
  findErpStockSuppliersByCompany,
  recordErpStockNotice,
} from "@sellbridge/database/repositories";
import {
  BLING_SIGNATURE_HEADER,
  isValidBlingSignature,
  parseBlingNotice,
} from "@sellbridge/marketplaces/bling";
import { withDeadline } from "@sellbridge/shared/deadline";
import { parseJsonText, readBodyWithin } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";
import { enqueueErpStockRefresh, forgetErpNotice, markErpNoticeSeen } from "@/lib/server/queues";
import { blingCredentials } from "./bling-access.server";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Bling wants a 2xx within 5 seconds, or retries for 3 days and then switches the webhook off.
 * The notice is already stored; a lost enqueue is read by the next 15-minute check.
 */
const ENQUEUE_DEADLINE_IN_MS = 1_000;

/** While Redis is slow or down, a notice is stored without the repeat check rather than lost. */
const SEEN_CHECK_DEADLINE_IN_MS = 300;

function reply(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function enqueueWithinDeadline(supplierId: string): Promise<void> {
  try {
    await withDeadline(
      enqueueErpStockRefresh(supplierId),
      ENQUEUE_DEADLINE_IN_MS,
      "Leitura do estoque do Bling",
    );
  } catch (error) {
    logger.error("bling.stock_notice_enqueue_failed", { supplierId, error });
  }
}

/** False for a notice already received (Bling's repeat or a replayed copy). */
async function isFirstDelivery(eventId: string): Promise<boolean> {
  try {
    return await withDeadline(
      markErpNoticeSeen(eventId),
      SEEN_CHECK_DEADLINE_IN_MS,
      "Aviso do Bling já recebido",
    );
  } catch (error) {
    logger.warn("bling.notice_seen_check_failed", { error });
    return true;
  }
}

async function releaseNotice(eventId: string): Promise<void> {
  try {
    await withDeadline(forgetErpNotice(eventId), SEEN_CHECK_DEADLINE_IN_MS, "Aviso do Bling");
  } catch (error) {
    logger.warn("bling.notice_release_failed", { error });
  }
}

/** Stores a stock notice for every supplier following that Bling company and queues the read. */
async function acceptStockNotice(companyId: string, erpProductId: number): Promise<void> {
  const supplierIds = await findErpStockSuppliersByCompany(database, companyId);
  if (supplierIds.length === 0) {
    logger.info("bling.stock_notice_unmatched", { erpProductId });
    return;
  }
  await recordErpStockNotice(database, {
    supplierIds,
    erpCompanyId: companyId,
    erpProductIds: [erpProductId],
    receivedAt: new Date(),
  });
  await Promise.all(supplierIds.map(enqueueWithinDeadline));
}

/**
 * POST /api/webhooks/bling: Bling's notifications for every account that authorized the app.
 * A forged one (bad signature) gets 401; any signed one gets 200, even when SellBridge does not
 * use it, because refusing would make Bling switch the webhook off.
 */
export async function handleBlingWebhook(request: Request): Promise<Response> {
  const credentials = blingCredentials();
  if (credentials === null) {
    return reply(404, { error: "integração indisponível" });
  }
  const rawBody = await readBodyWithin(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return reply(413, { error: "notificação grande demais" });
  }
  const signature = request.headers.get(BLING_SIGNATURE_HEADER);
  if (!isValidBlingSignature({ rawBody, signature, clientSecret: credentials.clientSecret })) {
    logger.warn("bling.notice_rejected", { reason: "invalid_signature" });
    return reply(401, { error: "notificação inválida" });
  }
  const notice = parseBlingNotice(parseJsonText(new TextDecoder().decode(rawBody)));
  if (notice === null) {
    logger.warn("bling.notice_unreadable", {});
    return reply(200, { status: "ignorada" });
  }
  if (notice.kind === "other") {
    return reply(200, { status: "ignorada" });
  }
  if (!(await isFirstDelivery(notice.eventId))) {
    return reply(200, { status: "repetida" });
  }
  try {
    await acceptStockNotice(notice.companyId, notice.erpProductId);
  } catch (error) {
    // Not stored: Bling's retry of this event must not be taken for a repeat.
    await releaseNotice(notice.eventId);
    throw error;
  }
  return reply(200, { status: "recebida" });
}
