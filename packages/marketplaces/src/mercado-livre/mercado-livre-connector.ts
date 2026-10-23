import type { MarketplaceConnector } from "../types.ts";
import type { MercadoLivreConfig, MercadoLivreContext } from "./client.ts";
import { publishProduct, updateDescription, updateStockPrice } from "./listings.ts";
import { authorizationUrl, exchangeCode, refreshTokens } from "./oauth.ts";
import { fetchOrder, listOrders } from "./orders.ts";
import { readMercadoLivreShippingAddress } from "./shipping.ts";
import { parseStoredOrderEvent, verifyWebhook } from "./webhook.ts";

export type { MercadoLivreConfig } from "./client.ts";
export { mapMercadoLivreOrder } from "./orders.ts";

/**
 * Composes the Mercado Livre modules (OAuth, listings, orders, webhooks) into a connector.
 * Every endpoint and field used is documented in docs/marketplaces/mercado-livre.md (official
 * docs, checked on 2026-10-08).
 */
export function createMercadoLivreConnector(config: MercadoLivreConfig): MarketplaceConnector {
  const context: MercadoLivreContext = {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
  return {
    id: "mercado_livre",
    displayName: "Mercado Livre",
    isConfigured: () => Boolean(config.clientId && config.clientSecret),
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
    readShippingAddress: async (store, orderId) =>
      readMercadoLivreShippingAddress(config, store, orderId),
  };
}
