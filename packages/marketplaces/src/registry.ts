import { createMercadoLivreConnector } from "./mercado-livre/mercado-livre-connector.ts";
import { createMockConnector } from "./mock/mock-connector.ts";
import type { MarketplaceConnector, MarketplaceId } from "./types.ts";
import { createUnavailableConnector } from "./unavailable-connector.ts";

export interface ConnectorRegistryConfig {
  appUrl: string;
  mockWebhookSecret: string;
  mockLatencyMilliseconds?: number;
  mercadoLivre?: { clientId: string | undefined; clientSecret: string | undefined };
}

export type ConnectorRegistry = Record<MarketplaceId, MarketplaceConnector>;

export const MARKETPLACE_LABELS: Record<MarketplaceId, string> = {
  mock: "Loja simulada",
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  tiktok_shop: "TikTok Shop",
};

export function createConnectorRegistry(config: ConnectorRegistryConfig): ConnectorRegistry {
  return {
    mock: createMockConnector({
      appUrl: config.appUrl,
      webhookSecret: config.mockWebhookSecret,
      ...(config.mockLatencyMilliseconds === undefined
        ? {}
        : { latencyMilliseconds: config.mockLatencyMilliseconds }),
    }),
    mercado_livre: createMercadoLivreConnector({
      clientId: config.mercadoLivre?.clientId,
      clientSecret: config.mercadoLivre?.clientSecret,
    }),
    // TODO: conectores reais da Shopee e do TikTok Shop depois do Mercado Livre.
    shopee: createUnavailableConnector("shopee", MARKETPLACE_LABELS.shopee),
    tiktok_shop: createUnavailableConnector("tiktok_shop", MARKETPLACE_LABELS.tiktok_shop),
  };
}
