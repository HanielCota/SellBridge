import {
  createConnectorRegistry,
  createMercadoLivreCatalog,
  type AuthorizationRequest,
  type MarketplaceId,
  type MercadoLivreConfig,
} from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { environment } from "./environment.ts";

export const connectors = createConnectorRegistry({
  mercadoLivre: {
    clientId: environment.MERCADO_LIVRE_CLIENT_ID,
    clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
  },
  tiktokShop: {
    appKey: environment.TIKTOK_SHOP_APP_KEY,
    appSecret: environment.TIKTOK_SHOP_APP_SECRET,
    serviceId: environment.TIKTOK_SHOP_SERVICE_ID,
  },
});

/** Categories and technical sheets; they need no seller account. */
export const mercadoLivreCatalog = createMercadoLivreCatalog();

/** The app's credentials for the direct Mercado Livre calls: shipments and labels. */
export const mercadoLivreApiConfig: MercadoLivreConfig = {
  clientId: environment.MERCADO_LIVRE_CLIENT_ID,
  clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
};

export const tokenCipher = createTokenCipher(environment.TOKEN_ENCRYPTION_KEY);

/** Marketplaces require the exact callback registered for APP_URL. */
export function oauthCallbackUrl(marketplace: string): string {
  return new URL(`/api/oauth/${marketplace}/callback`, environment.APP_URL).toString();
}

export function oauthAuthorizationUrl(
  marketplace: MarketplaceId,
  request: AuthorizationRequest,
): string {
  return connectors[marketplace].getAuthorizationUrl(request);
}
