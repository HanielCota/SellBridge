import { createMercadoLivreConnector } from "./mercado-livre/mercado-livre-connector.ts";
import { createShopeeConnector } from "./shopee/shopee-connector.ts";
import { createTikTokShopConnector } from "./tiktok-shop/tiktok-shop-connector.ts";
import type { MarketplaceConnector, MarketplaceId } from "./types.ts";
import { createUnavailableConnector } from "./unavailable-connector.ts";

export interface ConnectorRegistryConfig {
  mercadoLivre?: { clientId: string | undefined; clientSecret: string | undefined };
  shopee?: {
    partnerId: string | undefined;
    partnerKey: string | undefined;
    sandbox: boolean;
  };
  tiktokShop?: {
    appKey: string | undefined;
    appSecret: string | undefined;
    serviceId: string | undefined;
  };
}

export type ConnectorRegistry = Record<MarketplaceId, MarketplaceConnector>;

export const MARKETPLACE_LABELS: Record<MarketplaceId, string> = {
  mock: "Loja simulada (desativada)",
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
    shopee: createShopeeConnector({
      partnerId: config.shopee?.partnerId,
      partnerKey: config.shopee?.partnerKey,
      sandbox: config.shopee?.sandbox ?? false,
    }),
    tiktok_shop: createTikTokShopConnector({
      appKey: config.tiktokShop?.appKey,
      appSecret: config.tiktokShop?.appSecret,
      serviceId: config.tiktokShop?.serviceId,
    }),
  };
}
