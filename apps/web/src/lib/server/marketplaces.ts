import {
  createConnectorRegistry,
  type AuthorizationRequest,
  type MarketplaceId,
} from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { environment } from "./environment.ts";

export const connectors = createConnectorRegistry({
  appUrl: environment.APP_URL,
  mockWebhookSecret: environment.MOCK_WEBHOOK_SECRET,
  mockLatencyMilliseconds: 0,
  mercadoLivre: {
    clientId: environment.MERCADO_LIVRE_CLIENT_ID,
    clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
  },
});

export const tokenCipher = createTokenCipher(environment.TOKEN_ENCRYPTION_KEY);

/**
 * Real marketplaces only accept the redirect URI registered with them (on APP_URL). The
 * simulated one is our own page, so it can follow the trusted host the request came in on.
 */
export function oauthCallbackUrl(marketplace: string, appOrigin: string): string {
  const origin = marketplace === "mock" ? appOrigin : environment.APP_URL;
  return new URL(`/api/oauth/${marketplace}/callback`, origin).toString();
}

/** The consent page URL; the simulated one moves to `appOrigin` like its callback. */
export function oauthAuthorizationUrl(
  marketplace: MarketplaceId,
  request: AuthorizationRequest,
  appOrigin: string,
): string {
  const authorizationUrl = connectors[marketplace].getAuthorizationUrl(request);
  if (marketplace !== "mock") {
    return authorizationUrl;
  }
  const consentPage = new URL(authorizationUrl);
  return new URL(`${consentPage.pathname}${consentPage.search}`, appOrigin).toString();
}
