import type { Database } from "@sellbridge/database";
import {
  findStoreOrdersForClaim,
  listTrackableStoreOrders,
  markWebhookFailed,
  markWebhookProcessed,
  recordStoreShipmentNotice,
  saveMarketplaceClaim,
} from "@sellbridge/database/repositories";
import {
  isFinalMarketplaceAnswer,
  type MarketplaceClaim,
  type MarketplaceId,
  type MercadoLivreNotice,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { UnrecoverableError } from "bullmq";
import type { JobContext } from "../lib/job-context.ts";
import { decryptStoreCredentials, storeRateKey } from "../lib/store-access.ts";
import { type ReadQuestion, syncStoreQuestion } from "./buyer-question-sync.ts";
import {
  type TrackedShipping,
  type TrackOutcome,
  trackOrderShipment,
} from "./shipment-tracking.ts";

/** How shipment, claim and question notifications are read; absent, those topics are only stored. */
export interface NoticeReaders {
  parseNotice: (
    marketplace: MarketplaceId,
    topic: string,
    rawPayload: unknown,
  ) => MercadoLivreNotice | null;
  /** The store's marketplace order ids in one shipment. */
  readShipmentOrders: (store: StoreCredentials, shipmentId: string) => Promise<string[]>;
  readShipping: (store: StoreCredentials, externalOrderId: string) => Promise<TrackedShipping>;
  readClaim: (store: StoreCredentials, claimId: string) => Promise<MarketplaceClaim>;
  /** Absent while buyer questions are off (BUYER_QUESTIONS_ENABLED): the topic is only stored. */
  readQuestion?: ReadQuestion;
}

export interface NoticeDependencies {
  database: Database;
  cipher: TokenCipher;
  acquireRateLimit: (key: string) => Promise<void>;
  requestStockSync?: () => Promise<void>;
  readers: NoticeReaders;
}

export type NoticeOutcome =
  | "shipment_tracked"
  | "shipment_unknown"
  | "claim_saved"
  | "claim_outside_sellbridge"
  | "question_saved"
  | "question_outside_sellbridge"
  | "question_gone";

/** The event and the connected store it names, already checked by the webhook processor. */
export interface NoticeEvent {
  webhookEventId: string;
  receivedAt: Date;
  marketplace: MarketplaceId;
  store: { id: string; tenantId: string; externalShopId: string };
  accessTokenEnc: string;
}

/** One store's marketplace reads, with its decrypted token. */
export interface StoreRun {
  dependencies: Pick<NoticeDependencies, "database" | "acquireRateLimit"> & {
    readers: Pick<NoticeReaders, "readClaim" | "readShipmentOrders">;
  };
  marketplace: MarketplaceId;
  store: { id: string; tenantId: string };
  credentials: StoreCredentials;
}

interface NoticeRun extends StoreRun {
  dependencies: NoticeDependencies;
  event: NoticeEvent;
}

export type ClaimSync = "saved" | "outside_sellbridge";

/** A shipment the marketplace counts as SellBridge's: no order on its way here names it. */
const SHIPMENT_UNKNOWN_NOTE = "Envio sem pedido a caminho no SellBridge";
const SHIPMENT_FAILED_NOTE = "A leitura do envio falhou; a tarefa periódica tenta de novo";
const CLAIM_OUTSIDE_NOTE = "Reclamação de uma venda que não está no SellBridge";
const QUESTION_OUTSIDE_NOTE = "Pergunta de um anúncio publicado fora do SellBridge";
const QUESTION_GONE_NOTE = "Pergunta apagada no marketplace";

/** Notifications are unsigned: each marketplace call spends the store's own quota. */
async function spendStoreQuota(run: StoreRun): Promise<void> {
  await run.dependencies.acquireRateLimit(
    storeRateKey({ marketplace: run.marketplace, id: run.store.id }),
  );
}

async function ordersOfShipment(run: NoticeRun, shipmentId: string) {
  const { database, readers } = run.dependencies;
  const storeConnectionId = run.store.id;
  const stored = await listTrackableStoreOrders(database, {
    storeConnectionId,
    match: { marketplaceShipmentId: shipmentId },
  });
  if (stored.length > 0) {
    return stored;
  }
  await spendStoreQuota(run);
  const externalOrderIds = await readers.readShipmentOrders(run.credentials, shipmentId);
  return listTrackableStoreOrders(database, {
    storeConnectionId,
    match: { externalOrderIds },
  });
}

async function trackShipment(run: NoticeRun, shipmentId: string): Promise<NoticeOutcome> {
  const { dependencies, event } = run;
  await recordStoreShipmentNotice(dependencies.database, {
    storeConnectionId: event.store.id,
    receivedAt: event.receivedAt,
  });
  const rows = await ordersOfShipment(run, shipmentId);
  if (rows.length === 0) {
    await markWebhookProcessed(dependencies.database, event.webhookEventId, SHIPMENT_UNKNOWN_NOTE);
    return "shipment_unknown";
  }
  const tracking = {
    database: dependencies.database,
    cipher: dependencies.cipher,
    readShipping: dependencies.readers.readShipping,
  };
  const outcomes: TrackOutcome[] = [];
  // One at a time: each order costs the store a few marketplace calls.
  for (const row of rows) {
    await spendStoreQuota(run);
    outcomes.push(await trackOrderShipment(tracking, row));
  }
  if (outcomes.includes("changed") && dependencies.requestStockSync !== undefined) {
    await dependencies.requestStockSync();
  }
  const note = outcomes.includes("failed") ? SHIPMENT_FAILED_NOTE : undefined;
  await markWebhookProcessed(dependencies.database, event.webhookEventId, note);
  logger.info("shipment.notice_tracked", {
    webhookEventId: event.webhookEventId,
    orders: rows.length,
    changed: outcomes.filter((outcome) => outcome === "changed").length,
  });
  return "shipment_tracked";
}

/** The marketplace ids a claim names: an order or cart directly, or the orders of a shipment. */
async function claimOrderIds(run: StoreRun, claim: MarketplaceClaim): Promise<string[]> {
  if (claim.resource !== "shipment") {
    return [claim.resourceId];
  }
  await spendStoreQuota(run);
  return run.dependencies.readers.readShipmentOrders(run.credentials, claim.resourceId);
}

/** Admin "Problemas" shows the reason as the problem's text; one row per claim (`problemKey`). */
function logClaimMoment(
  run: StoreRun,
  order: { orderId: string; externalOrderId: string },
  claim: MarketplaceClaim,
  moment: string,
) {
  const fields = {
    tenantId: run.store.tenantId,
    storeConnectionId: run.store.id,
    orderId: order.orderId,
    externalClaimId: claim.externalClaimId,
    reasonId: claim.reasonId,
    problemKey: `claim:${claim.externalClaimId}`,
  };
  if (moment === "opened") {
    const reason = `Reclamação aberta pelo comprador no pedido ${order.externalOrderId}`;
    logger.warn("claim.opened", { ...fields, reason });
  }
  if (moment === "mediation") {
    const reason = `Reclamação do pedido ${order.externalOrderId} em mediação do Mercado Livre`;
    logger.warn("claim.mediation", { ...fields, reason });
  }
}

/**
 * Reads a claim of the store and stores it on its SellBridge order. A claim on a sale made outside
 * SellBridge (the reseller's account sells elsewhere too) is left alone.
 */
export async function syncStoreClaim(run: StoreRun, claimId: string): Promise<ClaimSync> {
  const { dependencies } = run;
  await spendStoreQuota(run);
  const claim = await dependencies.readers.readClaim(run.credentials, claimId);
  const [order] = await findStoreOrdersForClaim(dependencies.database, {
    storeConnectionId: run.store.id,
    externalIds: await claimOrderIds(run, claim),
  });
  if (order === undefined) {
    logger.info("claim.outside_sellbridge", {
      storeConnectionId: run.store.id,
      externalClaimId: claim.externalClaimId,
      resource: claim.resource,
    });
    return "outside_sellbridge";
  }
  const store = { ...run.store, marketplace: run.marketplace };
  const result = await saveMarketplaceClaim(dependencies.database, { store, order, claim });
  if (result.saved !== "stale" && result.moment !== null) {
    logClaimMoment(run, order, claim, result.moment);
  }
  return "saved";
}

async function saveClaimNotice(run: NoticeRun, claimId: string): Promise<NoticeOutcome> {
  const { database } = run.dependencies;
  const synced = await syncStoreClaim(run, claimId);
  if (synced === "outside_sellbridge") {
    await markWebhookProcessed(database, run.event.webhookEventId, CLAIM_OUTSIDE_NOTE);
    return "claim_outside_sellbridge";
  }
  await markWebhookProcessed(database, run.event.webhookEventId);
  return "claim_saved";
}

async function saveQuestionNotice(
  run: NoticeRun,
  readQuestion: ReadQuestion,
  questionId: string,
): Promise<NoticeOutcome> {
  const { database, acquireRateLimit } = run.dependencies;
  const synced = await syncStoreQuestion(
    { ...run, database, acquireRateLimit, readQuestion },
    questionId,
  );
  const webhookEventId = run.event.webhookEventId;
  if (synced === "outside_sellbridge") {
    await markWebhookProcessed(database, webhookEventId, QUESTION_OUTSIDE_NOTE);
    return "question_outside_sellbridge";
  }
  if (synced === "gone") {
    await markWebhookProcessed(database, webhookEventId, QUESTION_GONE_NOTE);
    return "question_gone";
  }
  await markWebhookProcessed(database, webhookEventId);
  return "question_saved";
}

async function handleNoticeFailure(
  dependencies: NoticeDependencies,
  context: { webhookEventId: string; job: JobContext },
  error: unknown,
): Promise<never> {
  const message = userMessageOr(error, "Falha ao processar o aviso");
  if (isFinalMarketplaceAnswer(error)) {
    await markWebhookProcessed(dependencies.database, context.webhookEventId, message);
    logger.error("webhook.notice_rejected_by_marketplace_answer", {
      webhookEventId: context.webhookEventId,
      error,
    });
    throw new UnrecoverableError(message);
  }
  const isFinal = context.job.attemptsMade + 1 >= context.job.maxAttempts;
  await markWebhookFailed(dependencies.database, context.webhookEventId, message);
  logger.warn("webhook.notice_failed", { webhookEventId: context.webhookEventId, isFinal, error });
  throw error;
}

/** The webhook processor only hands over a question notice while questions are on. */
function requireQuestionReader(dependencies: NoticeDependencies): ReadQuestion {
  if (dependencies.readers.readQuestion === undefined) {
    throw new UnrecoverableError("Leitura de perguntas desligada");
  }
  return dependencies.readers.readQuestion;
}

/**
 * A shipment or claim notification is only a prompt: the resource is read again with the store's
 * token. A shipment refreshes the tracking of the orders it holds; a claim is stored on its order.
 */
export async function processMarketplaceNotice(
  dependencies: NoticeDependencies,
  input: { job: JobContext; event: NoticeEvent; notice: MercadoLivreNotice },
): Promise<NoticeOutcome> {
  const { event, notice } = input;
  try {
    // Decrypted inside the try, so a bad token is recorded on the event.
    const credentials = decryptStoreCredentials(dependencies.cipher, {
      externalShopId: event.store.externalShopId,
      accessTokenEnc: event.accessTokenEnc,
    });
    const run: NoticeRun = {
      dependencies,
      event,
      marketplace: event.marketplace,
      store: { id: event.store.id, tenantId: event.store.tenantId },
      credentials,
    };
    if (notice.kind === "shipment") {
      return await trackShipment(run, notice.shipmentId);
    }
    if (notice.kind === "question") {
      return await saveQuestionNotice(run, requireQuestionReader(dependencies), notice.questionId);
    }
    return await saveClaimNotice(run, notice.claimId);
  } catch (error) {
    return handleNoticeFailure(
      dependencies,
      { webhookEventId: event.webhookEventId, job: input.job },
      error,
    );
  }
}
