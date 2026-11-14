import { SHIPPING_ADDRESS_NOT_SUPPORTED } from "../shipping-address.ts";
import type { MarketplaceConnector, StoreCredentials } from "../types.ts";
import { isTikTokShopConfigured, type TikTokShopConfig, type TikTokShopContext } from "./client.ts";
import { publishProduct, updateDescription, updateStockPrice } from "./listings.ts";
import { authorizationUrl, exchangeCode, refreshTokens } from "./oauth.ts";
import { fetchOrder, listOrders } from "./orders.ts";
import { getTikTokShopLabel, type TikTokShopLabel } from "./shipping.ts";
import { parseStoredOrderEvent, verifyWebhook } from "./webhook.ts";

export type { TikTokShopConfig } from "./client.ts";
export type { TikTokShopLabel } from "./shipping.ts";

function createContext(config: TikTokShopConfig): TikTokShopContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
    shopCiphers: new Map(),
  };
}

/**
 * Composes the TikTok Shop modules (OAuth, signing, listings, orders, webhooks) into a connector.
 * Written from the official API reference only (docs/marketplaces/tiktok-shop.md, read on
 * 2026-11-13) and tested against documented sample responses: the live test waits for the app
 * keys. Without app key, secret and service id it reports itself as not configured.
 */
export function createTikTokShopConnector(config: TikTokShopConfig): MarketplaceConnector {
  const context = createContext(config);
  return {
    id: "tiktok_shop",
    displayName: "TikTok Shop",
    isConfigured: () => isTikTokShopConfigured(config),
    getAuthorizationUrl: (request) => authorizationUrl(config, request),
    exchangeCode: async (exchange) => exchangeCode(context, exchange),
    refreshTokens: async (refreshToken) => refreshTokens(context, refreshToken),
    publishProduct: async (store, input, options) => publishProduct(context, store, input, options),
    updateStockPrice: async (store, update) => updateStockPrice(context, store, update),
    updateDescription: async (store, update) => updateDescription(context, store, update),
    listOrders: async (store, since) => listOrders(context, store, since),
    fetchOrder: async (store, resource) => fetchOrder(context, store, resource),
    verifyWebhook: async (request) => verifyWebhook(config, request),
    parseStoredOrderEvent,
    readShippingAddress: async () => SHIPPING_ADDRESS_NOT_SUPPORTED,
  };
}

/** The shipping label of a TikTok Shop order, for the fulfillment screens. */
export async function getTikTokShopShippingLabel(
  config: TikTokShopConfig,
  store: StoreCredentials,
  orderId: string,
): Promise<TikTokShopLabel> {
  return getTikTokShopLabel(createContext(config), store, orderId);
}
