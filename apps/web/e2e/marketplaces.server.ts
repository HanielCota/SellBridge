import type {
  AuthorizationRequest,
  MarketplaceId,
  MercadoLivreConfig,
  ShopeeConfig,
  TikTokShopConfig,
} from "@sellbridge/marketplaces";
import {
  createTestConnectorRegistry,
  createTestMercadoLivreCatalog,
} from "@sellbridge/marketplaces/testing";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { environment } from "../src/lib/server/environment";
import { requireEnvironmentVariable } from "./environment";
import { mercadoLivreStandIn } from "./mercado-livre.fixture";
import { shopeeStandInConfig } from "./shopee.fixture";
import { tiktokShopStandInConfig } from "./tiktok-shop.fixture";

export const connectors = createTestConnectorRegistry({
  appUrl: environment.APP_URL,
  webhookSecret: requireEnvironmentVariable("E2E_MARKETPLACE_SECRET"),
  latencyMilliseconds: 0,
});
export const mercadoLivreCatalog = createTestMercadoLivreCatalog();
export const tokenCipher = createTokenCipher(environment.TOKEN_ENCRYPTION_KEY);

/** Shipments and labels answer from the local stand-in, never from the real Mercado Livre. */
export const mercadoLivreApiConfig: MercadoLivreConfig = {
  clientId: environment.MERCADO_LIVRE_CLIENT_ID,
  clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
  fetchImplementation: mercadoLivreStandIn,
  retry: { retries: 0 },
};

/** Labels and pickups answer from the local stand-in, never from the real Shopee. */
export const shopeeApiConfig: ShopeeConfig = {
  ...shopeeStandInConfig,
  webhookUrl: new URL("/api/webhooks/shopee", environment.APP_URL).toString(),
};

/** Labels answer from the local stand-in, never from the real TikTok Shop. */
export const tiktokShopApiConfig: TikTokShopConfig = tiktokShopStandInConfig;

export function oauthCallbackUrl(marketplace: string): string {
  return new URL(`/api/oauth/${marketplace}/callback`, environment.APP_URL).toString();
}

export function oauthAuthorizationUrl(marketplace: MarketplaceId, request: AuthorizationRequest) {
  return connectors[marketplace].getAuthorizationUrl(request);
}
