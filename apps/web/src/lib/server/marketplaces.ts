import {
  createConnectorRegistry,
  type AuthorizationRequest,
  type MarketplaceId,
} from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { environment } from "./environment.ts";

export const connectors = createConnectorRegistry({
  mercadoLivre: {
    clientId: environment.MERCADO_LIVRE_CLIENT_ID,
    clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
  },
});

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
