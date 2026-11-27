import type { MarketplaceConnector, StoreCredentials } from "../types.ts";
import { isShopeeConfigured, type ShopeeConfig, type ShopeeContext } from "./client.ts";
import { publishProduct, updateDescription, updateStockPrice } from "./listings.ts";
import { authorizationUrl, exchangeCode, refreshTokens } from "./oauth.ts";
import { fetchOrder, listOrders, readShippingAddress } from "./orders.ts";
import {
  type ConfirmedPickup,
  getShopeeShippingLabel as readShippingLabel,
  readShopeePickupOptions as readPickupOptions,
} from "./shipping.ts";
import { parseStoredOrderEvent, verifyWebhook } from "./webhook.ts";

export type { ShopeeConfig } from "./client.ts";

function createContext(config: ShopeeConfig): ShopeeContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}

export function createShopeeConnector(config: ShopeeConfig): MarketplaceConnector {
  const context = createContext(config);
  return {
    id: "shopee",
    displayName: "Shopee",
    isConfigured: () => isShopeeConfigured(config),
    getAuthorizationUrl: (request) => authorizationUrl(config, request),
    exchangeCode: async (exchange) => exchangeCode(context, exchange),
    refreshTokens: async (refreshToken, store) =>
      refreshTokens(context, refreshToken, store.externalShopId),
    publishProduct: async (store, input, options) => publishProduct(context, store, input, options),
    updateStockPrice: async (store, update) => updateStockPrice(context, store, update),
    updateDescription: async (store, update) => updateDescription(context, store, update),
    listOrders: async (store, since) => listOrders(context, store, since),
    listUpdatedOrders: async (store, since) => listOrders(context, store, since, "update_time"),
    fetchOrder: async (store, resource) => fetchOrder(context, store, resource),
    orderResource: (orderId) => orderId,
    verifyWebhook: async (request) => verifyWebhook(config, request),
    parseStoredOrderEvent,
    readShippingAddress: async (store, orderId) => readShippingAddress(context, store, orderId),
  };
}

/**
 * The order's label. When the carrier picks it up, the pickup must be one the person confirmed
 * from {@link readShopeePickupOptions}: it is never scheduled on the shop's default address alone.
 *
 * @throws {AppError} EXTERNAL_PROVIDER with the PICKUP_CONFIRMATION_CAUSE cause when the pickup
 * needs confirming, and when Shopee no longer offers the confirmed address or time slot.
 */
export function getShopeeShippingLabel(
  config: ShopeeConfig,
  store: StoreCredentials,
  orderId: string,
  pickup?: ConfirmedPickup,
) {
  return readShippingLabel(createContext(config), store, orderId, pickup);
}

/** Where the carrier can pick the order up, or "not needed" for a drop-off or an arranged one. */
export function readShopeePickupOptions(
  config: ShopeeConfig,
  store: StoreCredentials,
  orderId: string,
) {
  return readPickupOptions(createContext(config), store, orderId);
}
