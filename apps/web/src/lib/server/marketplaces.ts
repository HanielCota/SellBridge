import { createConnectorRegistry, createTokenCipher } from "@sellbridge/marketplaces";
import { env } from "./env.ts";

export const connectors = createConnectorRegistry({
  appUrl: env.APP_URL,
  mockWebhookSecret: env.MOCK_WEBHOOK_SECRET,
  mockLatencyMs: 0,
  mercadoLivre: {
    clientId: env.MERCADO_LIVRE_CLIENT_ID,
    clientSecret: env.MERCADO_LIVRE_CLIENT_SECRET,
  },
});

export const tokenCipher = createTokenCipher(env.TOKEN_ENCRYPTION_KEY);

export function oauthCallbackUrl(marketplace: string): string {
  return new URL(`/api/oauth/${marketplace}/callback`, env.APP_URL).toString();
}
