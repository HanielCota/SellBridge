import type { AuthorizationRequest, MarketplaceId } from "@sellbridge/marketplaces";
import { createTestConnectorRegistry } from "@sellbridge/marketplaces/testing";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { environment } from "../src/lib/server/environment";
import { requireEnvironmentVariable } from "./environment";

export const connectors = createTestConnectorRegistry({
  appUrl: environment.APP_URL,
  webhookSecret: requireEnvironmentVariable("E2E_MARKETPLACE_SECRET"),
  latencyMilliseconds: 0,
});
export const tokenCipher = createTokenCipher(environment.TOKEN_ENCRYPTION_KEY);

export function oauthCallbackUrl(marketplace: string): string {
  return new URL(`/api/oauth/${marketplace}/callback`, environment.APP_URL).toString();
}

export function oauthAuthorizationUrl(marketplace: MarketplaceId, request: AuthorizationRequest) {
  return connectors[marketplace].getAuthorizationUrl(request);
}
