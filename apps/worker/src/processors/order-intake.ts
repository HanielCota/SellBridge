import type { Database } from "@sellbridge/database";
import { upsertMarketplaceOrder } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { type MarketplaceOrder, sealShippingAddress } from "@sellbridge/marketplaces";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";

export interface OrderIntakeDependencies {
  database: Database;
  cipher: TokenCipher;
  /** Asks the stock and price sync to run now instead of at its next scheduled run. */
  requestStockSync: () => Promise<void>;
  /** Asks to forward a paid order to its suppliers on its own (item 21.b; a no-op when off). */
  requestAutoForward: (orderId: string) => Promise<void>;
}

/** Where an order came from, for the logs: a marketplace notification or a reconnection catch-up. */
export type OrderSource = { webhookEventId: string } | { storeConnectionId: string };

/**
 * The order is saved either way: when Redis is down, the scheduled sync sends the new count a
 * few minutes later, so a failed request is logged, not thrown.
 */
async function requestStockSyncSafely(
  dependencies: OrderIntakeDependencies,
  source: OrderSource,
): Promise<void> {
  try {
    await dependencies.requestStockSync();
  } catch (error) {
    logger.warn("stock.sync_deferred", { ...source, error });
  }
}

/** Same as the stock sync: the order is saved, and a failed request is logged, not thrown. */
async function requestAutoForwardSafely(
  dependencies: OrderIntakeDependencies,
  context: { source: OrderSource; orderId: string },
): Promise<void> {
  try {
    await dependencies.requestAutoForward(context.orderId);
  } catch (error) {
    logger.warn("order.auto_forward_deferred", {
      ...context.source,
      orderId: context.orderId,
      error,
    });
  }
}

/**
 * The order as stored: the buyer's address, when the marketplace sent one, goes in encrypted
 * (docs/marketplaces/order-shipping-address.md); its fields are never logged.
 */
function incomingOrder(cipher: TokenCipher, order: MarketplaceOrder) {
  const { shippingAddress, ...fields } = order;
  if (shippingAddress === undefined) {
    return fields;
  }
  return { ...fields, shippingAddressEnc: sealShippingAddress(cipher, shippingAddress) };
}

/** Saves an order the marketplace sent for the store, then asks for the stock sync and forward. */
export async function saveMarketplaceOrder(
  dependencies: OrderIntakeDependencies,
  store: { id: string; tenantId: string },
  order: MarketplaceOrder,
  source: OrderSource,
): Promise<"created" | "updated"> {
  const result = await upsertMarketplaceOrder(
    dependencies.database,
    store.tenantId,
    store.id,
    incomingOrder(dependencies.cipher, order),
  );
  if (result.stockMoves > 0) {
    await requestStockSyncSafely(dependencies, source);
  }
  if (order.status === "paid") {
    await requestAutoForwardSafely(dependencies, { source, orderId: result.orderId });
  }
  return result.status;
}
