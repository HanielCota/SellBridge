import type { MarketplaceConnector } from "../types.ts";
import { createUnavailableConnector } from "../unavailable-connector.ts";
import { isTikTokShopConfigured, type TikTokShopConfig, type TikTokShopContext } from "./client.ts";
import { publishProduct, updateDescription, updateStockPrice } from "./listings.ts";
import { authorizationUrl, exchangeCode, refreshTokens } from "./oauth.ts";

export type { TikTokShopConfig } from "./client.ts";

function createContext(config: TikTokShopConfig): TikTokShopContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
    shopCiphers: new Map(),
  };
}

/**
 * Composes the TikTok Shop modules (OAuth, signing, listings) into a connector. Orders and
 * webhooks still answer "not available yet", as before this connector existed. Written from the
 * official API reference only (docs/marketplaces/tiktok-shop.md, read on 2026-11-13) and tested
 * against documented sample responses: the live test waits for the app keys. Without app key,
 * secret and service id it reports itself as not configured.
 */
export function createTikTokShopConnector(config: TikTokShopConfig): MarketplaceConnector {
  const context = createContext(config);
  return {
    ...createUnavailableConnector("tiktok_shop", "TikTok Shop"),
    isConfigured: () => isTikTokShopConfigured(config),
    getAuthorizationUrl: (request) => authorizationUrl(config, request),
    exchangeCode: async (exchange) => exchangeCode(context, exchange),
    refreshTokens: async (refreshToken) => refreshTokens(context, refreshToken),
    publishProduct: async (store, input, options) => publishProduct(context, store, input, options),
    updateStockPrice: async (store, update) => updateStockPrice(context, store, update),
    updateDescription: async (store, update) => updateDescription(context, store, update),
  };
}
