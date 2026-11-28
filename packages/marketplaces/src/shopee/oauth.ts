import type { AppError } from "@sellbridge/shared/errors";
import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import type { AuthorizationRequest, CodeExchange, ConnectedShop, OAuthTokens } from "../types.ts";
import {
  partnerCredentials,
  requestPublic,
  requestShop,
  shopeeHosts,
  type ShopeeConfig,
  type ShopeeContext,
} from "./client.ts";
import { type ShopeeEnvelope, shopInfoSchema, tokenSchema } from "./schemas.ts";

/** Shopee shop ids are integers; the JSON body carries them as numbers. */
const SHOP_ID_PATTERN = /^\d{1,19}$/;
/** SellBridge sells in Brazil: a shop from another market cannot take its listings. */
const HOME_REGION = "BR";
/** The only status in which a shop can sell (`v2.shop.get_shop_info`). */
const ACTIVE_SHOP_STATUS = "NORMAL";

/**
 * The seller consent link ("Authorization and Authentication", Generating the authorization
 * link). The state goes both as the documented parameter and inside the redirect URI, so the
 * callback finds it even if Shopee forwards only `code` and `shop_id`. [live test] which of the
 * two comes back.
 */
export function authorizationUrl(config: ShopeeConfig, request: AuthorizationRequest): string {
  const { partnerId } = partnerCredentials(config);
  const redirect = new URL(request.redirectUri);
  redirect.searchParams.set("state", request.state);
  const url = new URL(shopeeHosts(config).authorize);
  url.searchParams.set("partner_id", partnerId);
  url.searchParams.set("auth_type", "seller");
  url.searchParams.set("redirect_uri", redirect.toString());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", request.state);
  return url.toString();
}

/** The shop id as the integer the token endpoints expect; null when it is not one. */
function shopIdNumber(shopId: string | undefined): number | null {
  const trimmed = shopId?.trim() ?? "";
  if (!SHOP_ID_PATTERN.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function tokensFrom(
  context: ShopeeContext,
  token: { access_token: string; refresh_token: string; expire_in: number },
): OAuthTokens {
  const expiresAt = new Date(context.now().getTime() + token.expire_in * 1000);
  if (Number.isNaN(expiresAt.getTime())) {
    throw marketplaceError("Resposta inesperada da Shopee", { retryable: false });
  }
  return { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt };
}

/** GetAccessToken's documented error for a code that is expired, already used or invalid. */
const INVALID_CODE_ERROR = "invalid_code";
/** RefreshAccessToken's documented errors for a refresh token or shop access that ended. */
const ENDED_ACCESS_ERRORS: ReadonlySet<string> = new Set([
  "refresh_token_expired",
  "error_shop_refresh_token",
  "shop_access_expired",
  "shop_no_linked",
]);

/** A used or expired code (it lasts 10 minutes and works once) asks for a new consent. */
function explainCodeRefusal(envelope: ShopeeEnvelope): AppError | null {
  if (envelope.error !== INVALID_CODE_ERROR) {
    return null;
  }
  return marketplaceError(
    "A autorização da Shopee expirou antes de terminar. Conecte a loja de novo.",
    { retryable: false },
  );
}

async function readConnectedShop(
  context: ShopeeContext,
  accessToken: string,
  shopId: string,
): Promise<ConnectedShop> {
  const info = await requestShop(context, {
    schema: shopInfoSchema,
    payload: "top",
    method: "GET",
    path: "/api/v2/shop/get_shop_info",
    accessToken,
    shopId,
  });
  if (info.region !== HOME_REGION) {
    throw marketplaceError("Conecte uma loja da Shopee do Brasil.", { retryable: false });
  }
  if (info.status !== ACTIVE_SHOP_STATUS) {
    throw marketplaceError(
      "A loja está bloqueada ou congelada na Shopee. Resolva na Central do Vendedor e conecte de novo.",
      { retryable: false },
    );
  }
  return {
    externalShopId: shopId,
    shopName: info.shop_name.trim() === "" ? `Loja ${shopId}` : info.shop_name,
  };
}

/**
 * GetAccessToken with the code and the `shop_id` of the redirect. A main account sends
 * `main_account_id` instead, which SellBridge does not take: each shop connects on its own.
 */
export async function exchangeCode(
  context: ShopeeContext,
  exchange: CodeExchange,
): Promise<{ tokens: OAuthTokens; shop: ConnectedShop }> {
  const shopId = shopIdNumber(exchange.externalShopId);
  if (shopId === null) {
    throw marketplaceError(
      "A Shopee não informou a loja. Entre com a conta da loja (não com a conta principal) e conecte de novo.",
      { retryable: false },
    );
  }
  const { partnerId } = partnerCredentials(context.config);
  const token = await requestPublic(context, {
    schema: tokenSchema,
    payload: "top",
    path: "/api/v2/auth/token/get",
    json: { code: exchange.code, partner_id: Number(partnerId), shop_id: shopId },
    explainRefusal: explainCodeRefusal,
  });
  const tokens = tokensFrom(context, token);
  const shop = await readConnectedShop(context, tokens.accessToken, String(shopId));
  return { tokens, shop };
}

/** A refresh token that Shopee no longer takes (used, older than 30 days or revoked). */
function explainRefreshRefusal(envelope: ShopeeEnvelope): AppError | null {
  if (ENDED_ACCESS_ERRORS.has(envelope.error ?? "")) {
    return marketplaceAuthError();
  }
  const message = (envelope.message ?? "").toLowerCase();
  return message.includes("refresh_token") ? marketplaceAuthError() : null;
}

/**
 * RefreshAccessToken for one shop. Every call returns a new refresh token and the old one stops
 * working, so the new pair must be saved.
 */
export async function refreshTokens(
  context: ShopeeContext,
  refreshToken: string,
  externalShopId: string,
): Promise<OAuthTokens> {
  const shopId = shopIdNumber(externalShopId);
  if (shopId === null) {
    throw marketplaceAuthError();
  }
  const { partnerId } = partnerCredentials(context.config);
  const token = await requestPublic(context, {
    schema: tokenSchema,
    payload: "top",
    path: "/api/v2/auth/access_token/get",
    json: { refresh_token: refreshToken, partner_id: Number(partnerId), shop_id: shopId },
    explainRefusal: explainRefreshRefusal,
  });
  if (token.shop_id !== undefined && token.shop_id !== shopId) {
    throw marketplaceError("Resposta inesperada da Shopee", { retryable: false });
  }
  return tokensFrom(context, token);
}
