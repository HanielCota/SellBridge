import { createHmac } from "node:crypto";
import { isAppError } from "@sellbridge/shared/errors";
import { describe, expect, it } from "vitest";
import { isMarketplaceAuthError, isRetryableError } from "../errors.ts";
import { createShopeeConnector } from "./shopee-connector.ts";
import { signShopCall } from "./signing.ts";
import {
  fakeShopee,
  jsonResponse,
  PARTNER_ID,
  PARTNER_KEY,
  refusal,
  type Responder,
} from "./testing/fake-shopee.ts";

/** Inside the 5-minute window Shopee accepts for `timestamp`. */
const NOW = new Date("2026-11-18T12:00:00Z");
const SHOP_ID = "727720655";
const REDIRECT_URI = "https://app.sellbridge.com.br/api/oauth/shopee/callback";

/** GetAccessToken / RefreshAccessToken response, as in "Authorization and Authentication". */
const TOKEN_RESPONSE = {
  request_id: "e3e3e7f33a6d5ea3a6a1b3f0f4b0a8d1",
  error: "",
  message: "",
  access_token: "4a6c4f716e4c4b5a4a5a6c5a7a6c4f71",
  refresh_token: "6d4c4a6d4f734a6f6c776a4a4c6e6b70",
  expire_in: 14_400,
};

/** v2.shop.get_shop_info: answers at the top level, without a `response` object. */
const SHOP_INFO_RESPONSE = {
  request_id: "1c7e9a5f0b2d4e6a8c0e2f4a6b8d0f2a",
  error: "",
  message: "",
  shop_name: "Loja da Pri",
  region: "BR",
  status: "NORMAL",
  is_cb: false,
};

function setup(routes: Record<string, Responder> = {}, options: { sandbox?: boolean } = {}) {
  const api = fakeShopee({
    "GET /api/v2/shop/get_shop_info": () => jsonResponse(SHOP_INFO_RESPONSE),
    ...routes,
  });
  const connector = createShopeeConnector({
    partnerId: PARTNER_ID,
    partnerKey: PARTNER_KEY,
    sandbox: options.sandbox ?? false,
    fetchImplementation: api.fetchImplementation,
    retry: { retries: 0 },
    now: () => NOW,
  });
  return { ...api, connector };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

function messageOf(error: unknown): string | false {
  return isAppError(error) && error.message;
}

describe("Shopee signing", () => {
  it("signs a shop call over partner id, path, timestamp, token and shop, as documented", () => {
    const documentedBase =
      "2001887/api/v2/shop/get_shop_info165571443159777174636562737266615546704c6d14701711";

    const sign = signShopCall({
      partnerId: "2001887",
      path: "/api/v2/shop/get_shop_info",
      timestamp: 1655714431,
      accessToken: "59777174636562737266615546704c6d",
      shopId: "14701711",
      partnerKey: PARTNER_KEY,
    });

    expect(sign).toBe(createHmac("sha256", PARTNER_KEY).update(documentedBase).digest("hex"));
  });
});

function isConfiguredWith(partnerId: string | undefined, partnerKey: string | undefined) {
  return createShopeeConnector({ partnerId, partnerKey }).isConfigured();
}

describe("Shopee configuration", () => {
  it("stays off without a numeric partner id and a key", () => {
    expect(isConfiguredWith(undefined, PARTNER_KEY)).toBe(false);
    expect(isConfiguredWith(PARTNER_ID, undefined)).toBe(false);
    expect(isConfiguredWith("parceiro", PARTNER_KEY)).toBe(false);
    expect(isConfiguredWith(PARTNER_ID, "  ")).toBe(false);
    expect(isConfiguredWith(PARTNER_ID, PARTNER_KEY)).toBe(true);
  });
});

describe("Shopee authorization link", () => {
  it("sends the seller to the Brazilian authorization page with the state twice", () => {
    const { connector } = setup();

    const link = new URL(
      connector.getAuthorizationUrl({ state: "state-1", redirectUri: REDIRECT_URI }),
    );

    expect(`${link.origin}${link.pathname}`).toBe("https://open.shopee.com.br/auth");
    expect(link.searchParams.get("partner_id")).toBe(PARTNER_ID);
    expect(link.searchParams.get("auth_type")).toBe("seller");
    expect(link.searchParams.get("response_type")).toBe("code");
    expect(link.searchParams.get("state")).toBe("state-1");
    const redirect = new URL(link.searchParams.get("redirect_uri") ?? "");
    expect(`${redirect.origin}${redirect.pathname}`).toBe(REDIRECT_URI);
    expect(redirect.searchParams.get("state")).toBe("state-1");
  });

  it("uses the sandbox hosts when the keys are sandbox ones", async () => {
    const { connector, calls } = setup(
      { "POST /api/v2/auth/token/get": () => jsonResponse(TOKEN_RESPONSE) },
      { sandbox: true },
    );

    const link = new URL(connector.getAuthorizationUrl({ state: "s", redirectUri: REDIRECT_URI }));
    await connector.exchangeCode({ code: "c", redirectUri: REDIRECT_URI, externalShopId: SHOP_ID });

    expect(`${link.origin}${link.pathname}`).toBe(
      "https://open.sandbox.test-stable.shopee.com/auth",
    );
    expect(calls.every((call) => call.host === "openplatform.sandbox.test-stable.shopee.sg")).toBe(
      true,
    );
  });
});

describe("Shopee connection", () => {
  it("exchanges the code with the shop id and reads the shop name", async () => {
    const { connector, calls } = setup({
      "POST /api/v2/auth/token/get": () => jsonResponse(TOKEN_RESPONSE),
    });

    const result = await connector.exchangeCode({
      code: "494d7a4a4f5a66524556776f66425453",
      redirectUri: REDIRECT_URI,
      externalShopId: SHOP_ID,
    });

    expect(calls[0]?.host).toBe("openplatform.shopee.com.br");
    expect(calls[0]?.json).toEqual({
      code: "494d7a4a4f5a66524556776f66425453",
      partner_id: Number(PARTNER_ID),
      shop_id: Number(SHOP_ID),
    });
    expect(calls[1]?.query.get("access_token")).toBe(TOKEN_RESPONSE.access_token);
    expect(calls[1]?.query.get("shop_id")).toBe(SHOP_ID);
    expect(result.shop).toEqual({ externalShopId: SHOP_ID, shopName: "Loja da Pri" });
    expect(result.tokens).toEqual({
      accessToken: TOKEN_RESPONSE.access_token,
      refreshToken: TOKEN_RESPONSE.refresh_token,
      expiresAt: new Date(NOW.getTime() + 14_400 * 1000),
    });
  });

  it("asks for the shop account when Shopee names no shop (a main account)", async () => {
    const { connector, calls } = setup();

    const error = await caught(connector.exchangeCode({ code: "c", redirectUri: REDIRECT_URI }));

    expect(messageOf(error)).toBe(
      "A Shopee não informou a loja. Entre com a conta da loja (não com a conta principal) e conecte de novo.",
    );
    expect(calls).toHaveLength(0);
  });

  it("explains a used or expired code in Portuguese", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/token/get": () => refusal("error_param", "Invalid code"),
    });

    const error = await caught(
      connector.exchangeCode({ code: "old", redirectUri: REDIRECT_URI, externalShopId: SHOP_ID }),
    );

    expect(messageOf(error)).toBe(
      "A autorização da Shopee expirou antes de terminar. Conecte a loja de novo.",
    );
  });

  it("refuses a shop from another market", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/token/get": () => jsonResponse(TOKEN_RESPONSE),
      "GET /api/v2/shop/get_shop_info": () => jsonResponse({ ...SHOP_INFO_RESPONSE, region: "SG" }),
    });

    const error = await caught(
      connector.exchangeCode({ code: "c", redirectUri: REDIRECT_URI, externalShopId: SHOP_ID }),
    );

    expect(messageOf(error)).toBe("Conecte uma loja da Shopee do Brasil.");
  });

  it("refuses a frozen or banned shop", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/token/get": () => jsonResponse(TOKEN_RESPONSE),
      "GET /api/v2/shop/get_shop_info": () =>
        jsonResponse({ ...SHOP_INFO_RESPONSE, status: "FROZEN" }),
    });

    const error = await caught(
      connector.exchangeCode({ code: "c", redirectUri: REDIRECT_URI, externalShopId: SHOP_ID }),
    );

    expect(isRetryableError(error)).toBe(false);
    expect(messageOf(error)).toMatch(/bloqueada ou congelada/);
  });
});

describe("Shopee token refresh", () => {
  it("refreshes per shop and keeps the new refresh token", async () => {
    const { connector, calls } = setup({
      "POST /api/v2/auth/access_token/get": () =>
        jsonResponse({
          ...TOKEN_RESPONSE,
          refresh_token: "novo-refresh",
          shop_id: Number(SHOP_ID),
        }),
    });

    const tokens = await connector.refreshTokens("refresh-antigo", { externalShopId: SHOP_ID });

    expect(calls[0]?.json).toEqual({
      refresh_token: "refresh-antigo",
      partner_id: Number(PARTNER_ID),
      shop_id: Number(SHOP_ID),
    });
    expect(calls[0]?.query.has("access_token")).toBe(false);
    expect(tokens.refreshToken).toBe("novo-refresh");
  });

  it("asks for reconnection when Shopee no longer takes the refresh token", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/access_token/get": () =>
        refusal("error_param", "Invalid refresh_token", 403),
    });

    const error = await caught(connector.refreshTokens("velho", { externalShopId: SHOP_ID }));

    expect(isMarketplaceAuthError(error)).toBe(true);
  });

  it("keeps the store connected when Shopee is rate limiting", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/access_token/get": () =>
        refusal("error_rate_limit", "Too many requests.", 429),
    });

    const error = await caught(connector.refreshTokens("r", { externalShopId: SHOP_ID }));

    expect(isMarketplaceAuthError(error)).toBe(false);
    expect(isRetryableError(error)).toBe(true);
  });

  it("refuses a pair that Shopee says belongs to another shop", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/access_token/get": () => jsonResponse({ ...TOKEN_RESPONSE, shop_id: 1 }),
    });

    const error = await caught(connector.refreshTokens("r", { externalShopId: SHOP_ID }));

    expect(messageOf(error)).toBe("Resposta inesperada da Shopee");
  });
});

describe("Shopee refusals", () => {
  it("asks for reconnection when the access token is no longer valid", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/token/get": () => jsonResponse(TOKEN_RESPONSE),
      "GET /api/v2/shop/get_shop_info": () => refusal("error_auth", "Invalid access_token.", 403),
    });

    const error = await caught(
      connector.exchangeCode({ code: "c", redirectUri: REDIRECT_URI, externalShopId: SHOP_ID }),
    );

    expect(isMarketplaceAuthError(error)).toBe(true);
  });

  it("names an unknown refusal for support, without Shopee's own words", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/token/get": () => jsonResponse(TOKEN_RESPONSE),
      "GET /api/v2/shop/get_shop_info": () =>
        refusal("error_kyc_auth", "No permission <b>seller</b> registration", 403),
    });

    const error = await caught(
      connector.exchangeCode({ code: "c", redirectUri: REDIRECT_URI, externalShopId: SHOP_ID }),
    );

    expect(messageOf(error)).toBe(
      "A Shopee recusou a operação (código error_kyc_auth). Fale com o suporte do SellBridge informando esse código.",
    );
  });

  it("explains an undeclared server address in Portuguese", async () => {
    const { connector } = setup({
      "POST /api/v2/auth/token/get": () =>
        refusal("source_ip_undeclared", "Request Source IP (1.2.3.4) is undeclared.", 403),
    });

    const error = await caught(
      connector.exchangeCode({ code: "c", redirectUri: REDIRECT_URI, externalShopId: SHOP_ID }),
    );

    expect(messageOf(error)).toBe(
      "A Shopee bloqueou o endereço do servidor do SellBridge. Fale com o suporte do SellBridge.",
    );
  });
});
