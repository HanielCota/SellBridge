import { createConnectorRegistry, createTokenCipher } from "@sellbridge/marketplaces";
import { environment } from "./environment.ts";

export const connectors = createConnectorRegistry({
  appUrl: environment.APP_URL,
  mockWebhookSecret: environment.MOCK_WEBHOOK_SECRET,
  mockLatencyMs: 0,
  mercadoLivre: {
    clientId: environment.MERCADO_LIVRE_CLIENT_ID,
    clientSecret: environment.MERCADO_LIVRE_CLIENT_SECRET,
  },
});

export const tokenCipher = createTokenCipher(environment.TOKEN_ENCRYPTION_KEY);

export function oauthCallbackUrl(marketplace: string): string {
  return new URL(`/api/oauth/${marketplace}/callback`, environment.APP_URL).toString();
}
