import {
  findConnectedStoreById,
  findHeldWebhookEvents,
  markWebhookProcessed,
} from "@sellbridge/database/repositories";
import {
  type ConnectorRegistry,
  isFinalMarketplaceAnswer,
  type StoreCredentials,
} from "@sellbridge/marketplaces";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { MAX_CATCH_UP_ROUNDS, type StoreOrderCatchUpJob } from "@sellbridge/shared/queues";
import { decryptStoreCredentials } from "../lib/store-access.ts";
import { type OrderIntakeDependencies, saveMarketplaceOrder } from "./order-intake.ts";

export type CatchUpDependencies = OrderIntakeDependencies & {
  connectors: ConnectorRegistry;
  /** Schedules the next round of a catch-up that stopped at a limit. */
  requestCatchUp: (job: StoreOrderCatchUpJob) => Promise<void>;
};

type ConnectedStore = NonNullable<Awaited<ReturnType<typeof findConnectedStoreById>>>;

/**
 * Held events checked once more on reconnection. Anyone who knows the app's public id can post a
 * Mercado Livre notification, so a reconnection never turns a pile of them into unbounded calls.
 */
export const MAX_HELD_EVENTS_CHECKED = 500;

/** The note of an event closed while its store had no access; it names the store to find it again. */
export function heldEventNote(storeConnectionId: string): string {
  return `Loja sem acesso: as vendas entram pela busca feita quando a loja for reconectada (loja ${storeConnectionId})`;
}

/**
 * A reconnected store's sales since it lost its access, read from the marketplace with the new
 * token, then the notifications that arrived meanwhile, checked once more. Orders already stored
 * are only updated, and a paid one is forwarded once. A read that stops at its limit (orders or
 * held events) schedules another round from where it stopped, until nothing is left.
 */
export async function catchUpStoreOrders(
  dependencies: CatchUpDependencies,
  job: StoreOrderCatchUpJob,
): Promise<"orders_caught_up" | "unknown_store"> {
  const store = await findConnectedStoreById(dependencies.database, job.storeConnectionId);
  if (store === null || store.accessTokenEnc === null) {
    // Disconnected or expired again before the job ran: the next reconnection asks again.
    logger.info("store.order_catch_up_skipped", { storeConnectionId: job.storeConnectionId });
    return "unknown_store";
  }

  const credentials = decryptStoreCredentials(dependencies.cipher, {
    externalShopId: store.externalShopId,
    accessTokenEnc: store.accessTokenEnc,
  });
  const since = new Date(job.since);
  const read =
    job.ordersDone === true ? null : await readOrders(dependencies, store, credentials, job);
  const checked = await recheckHeldEvents(dependencies, { store, credentials, since });
  logger.info("store.orders_caught_up", {
    storeConnectionId: store.id,
    tenantId: store.tenantId,
    since: job.since,
    round: job.round ?? 0,
    count: read?.count ?? 0,
    heldEventsChecked: checked,
  });
  const resumeFrom = read?.resumeFrom ?? null;
  if (resumeFrom !== null || checked >= MAX_HELD_EVENTS_CHECKED) {
    await scheduleNextRound(dependencies, job, resumeFrom);
  }
  return "orders_caught_up";
}

/** Saves the orders since the job's start (or where the last round stopped), oldest first. */
async function readOrders(
  dependencies: CatchUpDependencies,
  store: ConnectedStore,
  credentials: StoreCredentials,
  job: StoreOrderCatchUpJob,
): Promise<{ count: number; resumeFrom: Date | null }> {
  const from = new Date(job.resumeFrom ?? job.since);
  const batch = await dependencies.connectors[store.marketplace].listOrders(credentials, from);
  // Sequential on purpose: every order shares one store token and its marketplace rate limit.
  for (const order of batch.orders) {
    await saveMarketplaceOrder(dependencies, store, order, { storeConnectionId: store.id });
  }
  if (batch.resumeFrom === null) {
    return { count: batch.orders.length, resumeFrom: null };
  }
  if (batch.resumeFrom.getTime() <= from.getTime()) {
    // A whole read of orders from the same instant: starting there again would never move on.
    logger.error("store.order_catch_up_stuck", {
      storeConnectionId: store.id,
      from: from.toISOString(),
    });
    return { count: batch.orders.length, resumeFrom: null };
  }
  return { count: batch.orders.length, resumeFrom: batch.resumeFrom };
}

/** The next round: orders from where they stopped, or only the held events left. */
async function scheduleNextRound(
  dependencies: CatchUpDependencies,
  job: StoreOrderCatchUpJob,
  resumeFrom: Date | null,
): Promise<void> {
  const round = (job.round ?? 0) + 1;
  if (round > MAX_CATCH_UP_ROUNDS) {
    logger.error("store.order_catch_up_stopped", {
      storeConnectionId: job.storeConnectionId,
      since: job.since,
      rounds: MAX_CATCH_UP_ROUNDS,
    });
    return;
  }
  await dependencies.requestCatchUp({
    storeConnectionId: job.storeConnectionId,
    since: job.since,
    ...(resumeFrom === null ? { ordersDone: true } : { resumeFrom: resumeFrom.toISOString() }),
    round,
  });
}

interface HeldEventCheck {
  readonly store: ConnectedStore;
  readonly credentials: StoreCredentials;
  readonly since: Date;
}

/**
 * Each held event gets one more try with the new token and a new note, so a later reconnection
 * never checks it again. One the marketplace refuses for good keeps the reason and does not stop
 * the others; a failure worth retrying (rate limit, outage, token) stops here and fails the job,
 * leaving that event and the rest held for BullMQ's next attempt.
 */
async function recheckHeldEvents(
  dependencies: CatchUpDependencies,
  check: HeldEventCheck,
): Promise<number> {
  const events = await findHeldWebhookEvents(dependencies.database, {
    marketplace: check.store.marketplace,
    note: heldEventNote(check.store.id),
    receivedAfter: check.since,
    limit: MAX_HELD_EVENTS_CHECKED,
  });
  // Sequential on purpose: every check calls the marketplace with the same store token.
  for (const event of events) {
    const note = await recheckHeldEvent(dependencies, check, event);
    await markWebhookProcessed(dependencies.database, event.id, note);
  }
  return events.length;
}

/**
 * The event's order saved for the store; the note to keep on the event, or null when it worked.
 * Rethrows a failure that is not the marketplace's final answer, leaving the event untouched.
 */
async function recheckHeldEvent(
  dependencies: CatchUpDependencies,
  check: HeldEventCheck,
  event: { id: string; topic: string; rawPayload: unknown },
): Promise<string | null> {
  const connector = dependencies.connectors[check.store.marketplace];
  const reference = connector.parseStoredOrderEvent(event.topic, event.rawPayload);
  if (reference === null || reference.kind === "incomplete") {
    return "Evento sem loja ou recurso";
  }

  try {
    const order = await connector.fetchOrder(check.credentials, reference.resource);
    await saveMarketplaceOrder(dependencies, check.store, order, { webhookEventId: event.id });
    return null;
  } catch (error) {
    if (isFinalMarketplaceAnswer(error)) {
      logger.warn("store.held_event_check_failed", { webhookEventId: event.id, error });
      return userMessageOr(error, "Falha ao conferir o evento na reconexão");
    }

    logger.warn("store.held_event_check_deferred", { webhookEventId: event.id, error });
    throw error;
  }
}
