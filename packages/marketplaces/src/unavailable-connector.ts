import { marketplaceError } from "./errors.ts";
import type { MarketplaceConnector, MarketplaceId, WebhookVerification } from "./types.ts";

/**
 * Placeholder for marketplaces whose real connector is not implemented yet.
 * It reports itself as not configured, so the UI shows the option as "em breve".
 */
export function createUnavailableConnector(
  id: MarketplaceId,
  displayName: string,
): MarketplaceConnector {
  function notImplemented(operation: string): never {
    throw marketplaceError(`${operation} ainda não está disponível para ${displayName}`, {
      retryable: false,
    });
  }
  return {
    id,
    displayName,
    isConfigured: () => false,
    getAuthorizationUrl: () => notImplemented("Conexão"),
    exchangeCode: async () => notImplemented("Conexão"),
    refreshTokens: async () => notImplemented("Renovação de acesso"),
    publishProduct: async () => notImplemented("Publicação"),
    updateStockPrice: async () => notImplemented("Atualização de estoque e preço"),
    listOrders: async () => notImplemented("Listagem de pedidos"),
    fetchOrder: async () => notImplemented("Consulta de pedido"),
    verifyWebhook: async (): Promise<WebhookVerification> => ({
      valid: false,
      reason: `Webhooks de ${displayName} ainda não são suportados`,
      payload: null,
    }),
    parseStoredOrderEvent: () => null,
  };
}
