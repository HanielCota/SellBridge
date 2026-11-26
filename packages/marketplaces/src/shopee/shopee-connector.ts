import type { MarketplaceConnector, StoreCredentials } from "../types.ts";
import { isShopeeConfigured, type ShopeeConfig, type ShopeeContext } from "./client.ts";
import { publishProduct, updateDescription, updateStockPrice } from "./listings.ts";
import { authorizationUrl, exchangeCode, refreshTokens } from "./oauth.ts";
import { fetchOrder, listOrders, readShippingAddress } from "./orders.ts";
import { getShopeeShippingLabel as readShippingLabel } from "./shipping.ts";
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
    fetchOrder: async (store, resource) => fetchOrder(context, store, resource),
    orderResource: (orderId) => orderId,
    verifyWebhook: async (request) => verifyWebhook(config, request),
    parseStoredOrderEvent,
    readShippingAddress: async (store, orderId) => readShippingAddress(context, store, orderId),
  };
}

export function getShopeeShippingLabel(
  config: ShopeeConfig,
  store: StoreCredentials,
  orderId: string,
) {
  return readShippingLabel(createContext(config), store, orderId);
}
