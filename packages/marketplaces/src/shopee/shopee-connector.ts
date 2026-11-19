import { marketplaceError } from "../errors.ts";
import { SHIPPING_ADDRESS_NOT_SUPPORTED } from "../shipping-address.ts";
import type { MarketplaceConnector, WebhookVerification } from "../types.ts";
import { isShopeeConfigured, type ShopeeConfig, type ShopeeContext } from "./client.ts";
import { authorizationUrl, exchangeCode, refreshTokens } from "./oauth.ts";

export type { ShopeeConfig } from "./client.ts";

function createContext(config: ShopeeConfig): ShopeeContext {
  return {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
}

/** Operations of the later slices (publishing, orders, labels) until they are written. */
function notYetAvailable(operation: string): never {
  throw marketplaceError(`${operation} ainda não está disponível para a Shopee`, {
    retryable: false,
  });
}

/**
 * Composes the Shopee Open Platform v2 modules into a connector. Written from the official
 * reference only (docs/marketplaces/shopee.md, read on 2026-11-18) and tested against documented
 * sample responses. Without partner id and key it reports itself as not configured.
 */
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
    publishProduct: async () => notYetAvailable("Publicação"),
    updateStockPrice: async () => notYetAvailable("Atualização de estoque e preço"),
    updateDescription: async () => notYetAvailable("Atualização de descrição"),
    listOrders: async () => notYetAvailable("Listagem de pedidos"),
    fetchOrder: async () => notYetAvailable("Consulta de pedido"),
    verifyWebhook: async (): Promise<WebhookVerification> => ({
      valid: false,
      reason: "Avisos da Shopee ainda não são suportados",
      payload: null,
    }),
    parseStoredOrderEvent: () => null,
    readShippingAddress: async () => SHIPPING_ADDRESS_NOT_SUPPORTED,
  };
}
