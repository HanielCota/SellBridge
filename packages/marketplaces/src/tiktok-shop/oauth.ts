import { marketplaceError } from "../errors.ts";
import type { AuthorizationRequest, CodeExchange, ConnectedShop, OAuthTokens } from "../types.ts";
import {
  appCredentials,
  requestToken,
  type TikTokShopConfig,
  type TikTokShopContext,
} from "./client.ts";
import { tokenSchema } from "./schemas.ts";
import { chooseConnectedShop, listAuthorizedShops } from "./shops.ts";

/** Seller authorization link for every market but the US ("Authorization overview"). */
const AUTHORIZE_URL = "https://services.tiktokshop.com/open/authorize";
/** The documented grant name; not the standard OAuth "authorization_code". */
const CODE_GRANT = "authorized_code";

/**
 * The seller consent link. TikTok sends the seller back to the Redirect URL registered on the app,
 * so `redirectUri` is not part of the link; PKCE is not offered.
 */
export function authorizationUrl(config: TikTokShopConfig, request: AuthorizationRequest): string {
  const serviceId = config.serviceId?.trim() ?? "";
  if (serviceId === "") {
    throw marketplaceError("Integração com o TikTok Shop não configurada", { retryable: false });
  }
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("service_id", serviceId);
  url.searchParams.set("state", request.state);
  return url.toString();
}

async function requestTokens(
  context: TikTokShopContext,
  grant: { path: string; query: Record<string, string> },
): Promise<OAuthTokens> {
  const { appKey, appSecret } = appCredentials(context.config);
  const token = await requestToken(context, {
    schema: tokenSchema,
    path: grant.path,
    query: { app_key: appKey, app_secret: appSecret, ...grant.query },
  });
  const expiresAt = new Date(token.access_token_expire_in * 1000);
  if (Number.isNaN(expiresAt.getTime())) {
    throw marketplaceError("Resposta inesperada do TikTok Shop", { retryable: false });
  }
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt };
}

export async function exchangeCode(
  context: TikTokShopContext,
  exchange: CodeExchange,
): Promise<{ tokens: OAuthTokens; shop: ConnectedShop }> {
  const tokens = await requestTokens(context, {
    path: "/api/v2/token/get",
    query: { auth_code: exchange.code, grant_type: CODE_GRANT },
  });
  const shop = chooseConnectedShop(await listAuthorizedShops(context, tokens.accessToken));
  if (shop === null) {
    throw marketplaceError(
      "A conta autorizada não tem loja no TikTok Shop. Entre com a conta da loja e conecte de novo.",
      { retryable: false },
    );
  }
  return { tokens, shop: { externalShopId: shop.id, shopName: shop.name } };
}

export async function refreshTokens(
  context: TikTokShopContext,
  refreshToken: string,
): Promise<OAuthTokens> {
  return requestTokens(context, {
    path: "/api/v2/token/refresh",
    query: { refresh_token: refreshToken, grant_type: "refresh_token" },
  });
}
