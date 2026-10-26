import {
  findConnectedStoreById,
  findHeldWebhookEvents,
  markWebhookProcessed,
} from "@sellbridge/database/repositories";
import type { ConnectorRegistry, StoreCredentials } from "@sellbridge/marketplaces";
import { userMessageOr } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { StoreOrderCatchUpJob } from "@sellbridge/shared/queues";
import { decryptStoreCredentials } from "../lib/store-access.ts";
import { type OrderIntakeDependencies, saveMarketplaceOrder } from "./order-intake.ts";

export type CatchUpDependencies = OrderIntakeDependencies & { connectors: ConnectorRegistry };

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
 * are only updated, and a paid one is forwarded once.
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
  const orders = await dependencies.connectors[store.marketplace].listOrders(credentials, since);
  for (const order of orders) {
    await saveMarketplaceOrder(dependencies, store, order, { storeConnectionId: store.id });
  }
  const checked = await recheckHeldEvents(dependencies, { store, credentials, since });
  logger.info("store.orders_caught_up", {
    storeConnectionId: store.id,
    tenantId: store.tenantId,
    since: job.since,
    count: orders.length,
    heldEventsChecked: checked,
  });
  return "orders_caught_up";
}

interface HeldEventCheck {
  readonly store: ConnectedStore;
  readonly credentials: StoreCredentials;
  readonly since: Date;
}

/**
 * Each held event gets one more try with the new token and a new note, so a later reconnection
 * never checks it again. One that fails keeps the reason and does not stop the others.
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
  for (const event of events) {
    const note = await recheckHeldEvent(dependencies, check, event);
    await markWebhookProcessed(dependencies.database, event.id, note);
  }
  return events.length;
}

/** The event's order saved for the store; the note to keep on the event, or null when it worked. */
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
    logger.warn("store.held_event_check_failed", { webhookEventId: event.id, error });
    return userMessageOr(error, "Falha ao conferir o evento na reconexão");
  }
}
