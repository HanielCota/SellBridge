import { createHash } from "node:crypto";
import type { AuthorizationRequest, CodeExchange, OAuthTokens } from "../types.ts";
import {
  credentials,
  type MercadoLivreConfig,
  type MercadoLivreContext,
  requestJson,
} from "./client.ts";
import { tokenResponseSchema, userSchema } from "./schemas.ts";

const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";

type TokenWithUser = OAuthTokens & { userId: string };

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function requestToken(
  context: MercadoLivreContext,
  formFields: Record<string, string>,
): Promise<TokenWithUser> {
  const body = new URLSearchParams(formFields);
  const token = await requestJson(context, {
    schema: tokenResponseSchema,
    path: "/oauth/token",
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  });
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: new Date(context.now().getTime() + token.expires_in * 1000),
    userId: String(token.user_id),
  };
}

export function authorizationUrl(
  config: MercadoLivreConfig,
  request: AuthorizationRequest,
): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", credentials(config).clientId);
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("state", request.state);
  if (request.codeVerifier) {
    url.searchParams.set("code_challenge", pkceChallenge(request.codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export async function exchangeCode(context: MercadoLivreContext, exchange: CodeExchange) {
  const { clientId, clientSecret } = credentials(context.config);
  const token = await requestToken(context, {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: exchange.code,
    redirect_uri: exchange.redirectUri,
    ...(exchange.codeVerifier ? { code_verifier: exchange.codeVerifier } : {}),
  });
  const user = await requestJson(context, {
    schema: userSchema,
    path: "/users/me",
    init: { accessToken: token.accessToken },
  });
  const { userId: _userId, ...tokens } = token;
  return { tokens, shop: { externalShopId: String(user.id), shopName: user.nickname } };
}

export async function refreshTokens(
  context: MercadoLivreContext,
  refreshToken: string,
): Promise<OAuthTokens> {
  const { clientId, clientSecret } = credentials(context.config);
  const { userId: _userId, ...tokens } = await requestToken(context, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  return tokens;
}
