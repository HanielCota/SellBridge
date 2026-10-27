import { createMercadoLivreConnector } from "./mercado-livre/mercado-livre-connector.ts";
import type { MarketplaceConnector, MarketplaceId } from "./types.ts";
import { createUnavailableConnector } from "./unavailable-connector.ts";

export interface ConnectorRegistryConfig {
  mercadoLivre?: { clientId: string | undefined; clientSecret: string | undefined };
}

export type ConnectorRegistry = Record<MarketplaceId, MarketplaceConnector>;

export const MARKETPLACE_LABELS: Record<MarketplaceId, string> = {
  mock: "Integração descontinuada",
  mercado_livre: "Mercado Livre",
  shopee: "Shopee",
  tiktok_shop: "TikTok Shop",
};

export function createConnectorRegistry(config: ConnectorRegistryConfig): ConnectorRegistry {
  return {
    // Historical rows retain this enum value; no executable adapter remains.
    mock: createUnavailableConnector("mock", MARKETPLACE_LABELS.mock),
    mercado_livre: createMercadoLivreConnector({
      clientId: config.mercadoLivre?.clientId,
      clientSecret: config.mercadoLivre?.clientSecret,
    }),
    // No real connector yet: Shopee and TikTok Shop come after Mercado Livre.
    shopee: createUnavailableConnector("shopee", MARKETPLACE_LABELS.shopee),
    tiktok_shop: createUnavailableConnector("tiktok_shop", MARKETPLACE_LABELS.tiktok_shop),
  };
}
