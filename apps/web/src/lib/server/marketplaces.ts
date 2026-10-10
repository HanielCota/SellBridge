import { createConnectorRegistry } from "@sellbridge/marketplaces";
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

export function oauthCallbackUrl(marketplace: string): string {
  return new URL(`/api/oauth/${marketplace}/callback`, environment.APP_URL).toString();
}
