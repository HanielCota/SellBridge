import { findConnectedStoreById } from "@sellbridge/database/repositories";
import type { ConnectorRegistry } from "@sellbridge/marketplaces";
import { logger } from "@sellbridge/shared/logger";
import type { StoreOrderCatchUpJob } from "@sellbridge/shared/queues";
import { decryptStoreCredentials } from "../lib/store-access.ts";
import { type OrderIntakeDependencies, saveMarketplaceOrder } from "./order-intake.ts";

export type CatchUpDependencies = OrderIntakeDependencies & { connectors: ConnectorRegistry };

/**
 * A reconnected store's sales since it lost its access, read from the marketplace with the new
 * token. Notifications about a store without access are closed on arrival, so this is how its
 * sales come in; orders already stored are only updated, and a paid one is forwarded once.
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
  const orders = await dependencies.connectors[store.marketplace].listOrders(
    credentials,
    new Date(job.since),
  );
  for (const order of orders) {
    await saveMarketplaceOrder(dependencies, store, order, { storeConnectionId: store.id });
  }
  logger.info("store.orders_caught_up", {
    storeConnectionId: store.id,
    tenantId: store.tenantId,
    since: job.since,
    count: orders.length,
  });
  return "orders_caught_up";
}
