import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@sellbridge/shared/errors";
import {
  isMarketplaceAuthError,
  isMarketplaceListingEndedError,
  isRetryableError,
} from "../errors.ts";
import type { PublishOptions, PublishProductInput, StoreCredentials } from "../types.ts";
import {
  CATEGORY_RESPONSE,
  CREATED_PRODUCT_RESPONSE,
  EMPTY_SUCCESS,
  IMAGE_RESPONSE,
  PRODUCT_ID,
  PRODUCT_RESPONSE,
  refusal,
  SHOP_CIPHER,
  SHOP_ID,
  SHOPS_RESPONSE,
  SKU_ID,
  TOKEN_RESPONSE,
  WAREHOUSE_ID,
  WAREHOUSES_RESPONSE,
} from "./fixtures/responses.ts";
import {
  APP_KEY,
  APP_SECRET,
  fakeTikTokShop,
  jsonResponse,
  type Responder,
} from "./testing/fake-tiktok-shop.ts";
import type { ResolveHost } from "./client.ts";
import { createTikTokShopConnector } from "./tiktok-shop-connector.ts";

const API = "open-api.tiktokglobalshop.com";
const AUTH = "auth.tiktok-shops.com";
const IMAGE_HOST = "imagens.exemplo.com.br";
/** Inside the 5-minute window TikTok accepts for `timestamp`. */
const NOW = new Date("2026-11-13T12:00:00Z");
const STORE: StoreCredentials = { externalShopId: SHOP_ID, accessToken: "TTP_store_token" };

function imageResponse(): Response {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
    headers: { "content-type": "image/jpeg" },
  });
}

function setup(routes: Record<string, Responder> = {}, publicHost = true) {
  const api = fakeTikTokShop({
    [`GET ${API}/authorization/202309/shops`]: () => jsonResponse(SHOPS_RESPONSE),
    ...routes,
  });
  const resolveHost = vi.fn<ResolveHost>(async () => [publicHost ? "93.184.216.34" : "10.0.0.5"]);
  const connector = createTikTokShopConnector({
    appKey: APP_KEY,
    appSecret: APP_SECRET,
    serviceId: "7123456789",
    fetchImplementation: api.fetchImplementation,
    retry: { retries: 0 },
    now: () => NOW,
    resolveHost,
    // The real download pins its connection to public addresses (image-download.test.ts).
    downloadImage: async (url) => {
      const response = await api.fetchImplementation(url.toString(), { method: "GET" });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        bytes: new Uint8Array(await response.arrayBuffer()),
      };
    },
  });
  return { ...api, connector, resolveHost };
}

function publishInput(overrides: Partial<PublishProductInput> = {}): PublishProductInput {
  return {
    idempotencyKey: "target-0001",
    title: "Chá verde 100 g",
    description: "Chá verde em folhas.\nColheita 2026 & embalagem <lacrada>.",
    priceCents: 5990,
    stock: 7,
    sku: "SKU-1",
    imageUrls: [`https://${IMAGE_HOST}/cha.jpg`],
    packageWeightGrams: 150,
    ...overrides,
  };
}

function publishOptions() {
  return {
    creationStartedAt: null,
    beforeCreate: vi.fn<() => Promise<void>>(async () => {}),
    creationRejected: vi.fn<() => Promise<void>>(async () => {}),
    creationAbsent: vi.fn<() => Promise<void>>(async () => {}),
  } satisfies PublishOptions;
}

const PUBLISH_ROUTES: Record<string, Responder> = {
  [`POST ${API}/product/202309/categories/recommend`]: () => jsonResponse(CATEGORY_RESPONSE),
  [`GET ${API}/logistics/202309/warehouses`]: () => jsonResponse(WAREHOUSES_RESPONSE),
  [`GET ${IMAGE_HOST}/cha.jpg`]: () => imageResponse(),
  [`POST ${API}/product/202309/images/upload`]: () => jsonResponse(IMAGE_RESPONSE),
  [`POST ${API}/product/202309/products`]: () => jsonResponse(CREATED_PRODUCT_RESPONSE),
};

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("TikTok Shop configuration", () => {
  it("stays not configured until app key, secret and service id are all set", () => {
    const missingService = createTikTokShopConnector({
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      serviceId: " ",
    });
    const complete = createTikTokShopConnector({
      appKey: APP_KEY,
      appSecret: APP_SECRET,
      serviceId: "7123456789",
    });

    expect(missingService.isConfigured()).toBe(false);
    expect(complete.isConfigured()).toBe(true);
  });

  it("refuses to build a consent link without the service id", () => {
    const connector = createTikTokShopConnector({
      appKey: undefined,
      appSecret: undefined,
      serviceId: undefined,
    });

    expect(() => connector.getAuthorizationUrl({ state: "s", redirectUri: "https://x" })).toThrow(
      /não configurada/,
    );
  });
});

describe("TikTok Shop authorization", () => {
  it("sends the seller to the documented link with the service id and state only", () => {
    const { connector } = setup();

    const link = new URL(
      connector.getAuthorizationUrl({
        state: "state-1",
        redirectUri: "https://app.sellbridge.com.br/api/oauth/tiktok_shop/callback",
      }),
    );

    expect(`${link.origin}${link.pathname}`).toBe("https://services.tiktokshop.com/open/authorize");
    expect(link.searchParams.get("service_id")).toBe("7123456789");
    expect(link.searchParams.get("state")).toBe("state-1");
    expect(link.searchParams.has("redirect_uri")).toBe(false);
  });

  it("exchanges the code with grant_type authorized_code and connects the Brazilian shop", async () => {
    const { connector, calls } = setup({
      [`GET ${AUTH}/api/v2/token/get`]: () => jsonResponse(TOKEN_RESPONSE),
    });

    const result = await connector.exchangeCode({ code: "TTP_code", redirectUri: "https://x" });

    const tokenCall = calls[0];
    expect(tokenCall?.query.get("grant_type")).toBe("authorized_code");
    expect(tokenCall?.query.get("auth_code")).toBe("TTP_code");
    expect(tokenCall?.query.get("app_key")).toBe(APP_KEY);
    expect(result.shop).toEqual({ externalShopId: SHOP_ID, shopName: "Loja da Maria" });
    expect(result.tokens.refreshToken).toMatch(/^TTP_/);
    expect(result.tokens.expiresAt?.toISOString()).toBe(new Date(1660556783 * 1000).toISOString());
    expect(calls[1]?.accessTokenHeader).toBe(result.tokens.accessToken);
  });

  it("prefers the Brazilian shop when the authorization covers several markets", async () => {
    const shops = {
      ...SHOPS_RESPONSE,
      data: {
        shops: [
          { id: "1", name: "UK shop", region: "GB", cipher: "GB_cipher" },
          { id: SHOP_ID, name: "Loja BR", region: "BR", cipher: SHOP_CIPHER },
        ],
      },
    };
    const { connector } = setup({
      [`GET ${AUTH}/api/v2/token/get`]: () => jsonResponse(TOKEN_RESPONSE),
      [`GET ${API}/authorization/202309/shops`]: () => jsonResponse(shops),
    });

    const result = await connector.exchangeCode({ code: "TTP_code", redirectUri: "https://x" });

    expect(result.shop.externalShopId).toBe(SHOP_ID);
  });

  it("refreshes with grant_type refresh_token and keeps the new refresh token", async () => {
    const { connector, calls } = setup({
      [`GET ${AUTH}/api/v2/token/refresh`]: () => jsonResponse(TOKEN_RESPONSE),
    });

    const tokens = await connector.refreshTokens("TTP_old_refresh");

    expect(calls[0]?.query.get("grant_type")).toBe("refresh_token");
    expect(calls[0]?.query.get("refresh_token")).toBe("TTP_old_refresh");
    expect(tokens.refreshToken).toBe(TOKEN_RESPONSE.data.refresh_token);
  });

  it("explains a used or expired authorization code in Portuguese", async () => {
    const { connector } = setup({
      [`GET ${AUTH}/api/v2/token/get`]: () => jsonResponse(refusal(36004004, "Invalid auth code.")),
    });

    const error = await caught(connector.exchangeCode({ code: "old", redirectUri: "https://x" }));

    expect(isAppError(error) && error.message).toBe(
      "A autorização do TikTok Shop expirou antes de terminar. Conecte a loja de novo.",
    );
  });
});

describe("TikTok Shop publishing", () => {
  it("publishes a signed product with BRL price, weight, warehouse and uploaded photo", async () => {
    const { connector, calls } = setup(PUBLISH_ROUTES);
    const options = publishOptions();

    const listing = await connector.publishProduct(STORE, publishInput(), options);

    expect(listing).toEqual({ externalId: PRODUCT_ID, externalUrl: null, descriptionError: null });
    const create = calls.find((call) => call.path === "/product/202309/products");
    expect(create?.query.get("shop_cipher")).toBe(SHOP_CIPHER);
    expect(create?.accessTokenHeader).toBe(STORE.accessToken);
    expect(create?.json).toMatchObject({
      title: "Chá verde 100 g",
      description:
        "<p>Chá verde em folhas.</p><p>Colheita 2026 &amp; embalagem &lt;lacrada&gt;.</p>",
      category_id: "605254",
      main_images: [{ uri: IMAGE_RESPONSE.data.uri }],
      package_weight: { value: "150", unit: "GRAM" },
      idempotency_key: "target-0001",
      skus: [
        {
          seller_sku: "SKU-1",
          price: { amount: "59.90", currency: "BRL" },
          inventory: [{ warehouse_id: WAREHOUSE_ID, quantity: 7 }],
        },
      ],
    });
    expect(options.beforeCreate).toHaveBeenCalledOnce();
  });

  it("uploads the photo as multipart with the MAIN_IMAGE use case", async () => {
    const { connector, calls } = setup(PUBLISH_ROUTES);

    await connector.publishProduct(STORE, publishInput(), publishOptions());

    const upload = calls.find((call) => call.path === "/product/202309/images/upload");
    expect(upload?.form?.get("use_case")).toBe("MAIN_IMAGE");
    expect(upload?.form?.get("data")).toBeInstanceOf(Blob);
  });

  it("stops before calling TikTok when the product has no weight", async () => {
    const { connector, calls } = setup(PUBLISH_ROUTES);

    const error = await caught(
      connector.publishProduct(STORE, publishInput({ packageWeightGrams: null }), publishOptions()),
    );

    expect(isAppError(error) && error.message).toMatch(/peso da embalagem/);
    expect(calls).toHaveLength(0);
  });

  it("stops before calling TikTok when the description is empty", async () => {
    const { connector, calls } = setup(PUBLISH_ROUTES);

    const error = await caught(
      connector.publishProduct(STORE, publishInput({ description: " \n " }), publishOptions()),
    );

    expect(isAppError(error) && error.message).toMatch(/exige uma descrição/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a photo hosted on a private address without fetching it", async () => {
    const { connector, calls } = setup(PUBLISH_ROUTES, false);

    const error = await caught(connector.publishProduct(STORE, publishInput(), publishOptions()));

    expect(isAppError(error) && error.message).toMatch(/foto 1/);
    expect(calls.some((call) => call.host === IMAGE_HOST)).toBe(false);
  });

  it("clears the creation guard and explains a definitive refusal in Portuguese", async () => {
    const { connector } = setup({
      ...PUBLISH_ROUTES,
      [`POST ${API}/product/202309/products`]: () =>
        jsonResponse(refusal(12052104, "property is required")),
    });
    const options = publishOptions();

    const error = await caught(connector.publishProduct(STORE, publishInput(), options));

    expect(isAppError(error) && error.message).toMatch(/atributos obrigatórios/);
    expect(isRetryableError(error)).toBe(false);
    expect(options.creationRejected).toHaveBeenCalledOnce();
  });

  it("keeps the creation guard when the creation answer is a 5xx", async () => {
    const { connector } = setup({
      ...PUBLISH_ROUTES,
      [`POST ${API}/product/202309/products`]: () =>
        jsonResponse(refusal(36009003, "Internal error"), 503),
    });
    const options = publishOptions();

    const error = await caught(connector.publishProduct(STORE, publishInput(), options));

    expect(isRetryableError(error)).toBe(false);
    expect(options.creationRejected).not.toHaveBeenCalled();
  });

  it("reads the shop cipher once and reuses it for the next operations", async () => {
    const { connector, calls } = setup({
      ...PUBLISH_ROUTES,
      [`GET ${API}/product/202309/products/${PRODUCT_ID}`]: () => jsonResponse(PRODUCT_RESPONSE),
      [`POST ${API}/product/202309/products/${PRODUCT_ID}/prices/update`]: () =>
        jsonResponse(EMPTY_SUCCESS),
    });

    await connector.publishProduct(STORE, publishInput(), publishOptions());
    await connector.updateStockPrice(STORE, { externalId: PRODUCT_ID, priceCents: 6490 });

    const shopReads = calls.filter((call) => call.path === "/authorization/202309/shops");
    expect(shopReads).toHaveLength(1);
  });

  it("asks to reconnect when the shop is no longer authorized", async () => {
    const { connector } = setup({
      [`GET ${API}/authorization/202309/shops`]: () =>
        jsonResponse({ code: 0, data: { shops: [] } }),
    });

    const error = await caught(connector.publishProduct(STORE, publishInput(), publishOptions()));

    expect(isMarketplaceAuthError(error)).toBe(true);
  });
});

describe("TikTok Shop stock, price and description", () => {
  const productPath = `/product/202309/products/${PRODUCT_ID}`;

  it("updates price and stock on the product's SKU and warehouse", async () => {
    const { connector, calls } = setup({
      [`GET ${API}${productPath}`]: () => jsonResponse(PRODUCT_RESPONSE),
      [`POST ${API}${productPath}/prices/update`]: () => jsonResponse(EMPTY_SUCCESS),
      [`POST ${API}${productPath}/inventory/update`]: () => jsonResponse(EMPTY_SUCCESS),
    });

    await connector.updateStockPrice(STORE, { externalId: PRODUCT_ID, priceCents: 6490, stock: 3 });

    const price = calls.find((call) => call.path.endsWith("/prices/update"));
    const stock = calls.find((call) => call.path.endsWith("/inventory/update"));
    expect(price?.json).toEqual({
      skus: [{ id: SKU_ID, price: { amount: "64.90", currency: "BRL" } }],
    });
    expect(stock?.json).toEqual({
      skus: [{ id: SKU_ID, inventory: [{ warehouse_id: WAREHOUSE_ID, quantity: 3 }] }],
    });
  });

  it("ends the listing for good when TikTok no longer has the product", async () => {
    const { connector } = setup({
      [`GET ${API}${productPath}`]: () =>
        jsonResponse(refusal(12052032, "The product does not exist")),
    });

    const error = await caught(
      connector.updateStockPrice(STORE, { externalId: PRODUCT_ID, stock: 1 }),
    );

    expect(isMarketplaceListingEndedError(error)).toBe(true);
  });

  it("refuses a stock above what TikTok accepts", async () => {
    const { connector } = setup({
      [`GET ${API}${productPath}`]: () => jsonResponse(PRODUCT_RESPONSE),
    });

    const error = await caught(
      connector.updateStockPrice(STORE, { externalId: PRODUCT_ID, stock: 1_000_000 }),
    );

    expect(isAppError(error) && error.message).toMatch(/999\.999/);
  });

  it("replaces the description through partial edit, as HTML", async () => {
    const { connector, calls } = setup({
      [`POST ${API}/product/202509/products/${PRODUCT_ID}/partial_edit`]: () =>
        jsonResponse(EMPTY_SUCCESS),
    });

    await connector.updateDescription(STORE, { externalId: PRODUCT_ID, plainText: "Novo texto" });

    const edit = calls.find((call) => call.path.endsWith("/partial_edit"));
    expect(edit?.json).toEqual({ description: "<p>Novo texto</p>" });
  });
});

describe("TikTok Shop request errors", () => {
  it("asks to reconnect when the access token expired", async () => {
    const { connector } = setup({
      [`GET ${API}/authorization/202309/shops`]: () =>
        jsonResponse(refusal(105002, "Expired credentials")),
    });

    const error = await caught(
      connector.updateDescription(STORE, { externalId: PRODUCT_ID, plainText: "x" }),
    );

    expect(isMarketplaceAuthError(error)).toBe(true);
  });

  it("asks to reconnect when the access token header is refused", async () => {
    const { connector } = setup({
      [`GET ${API}/authorization/202309/shops`]: () =>
        jsonResponse(
          refusal(36009004, "Invalid credentials. The x-tts-access-token header is invalid."),
        ),
    });

    const error = await caught(
      connector.updateDescription(STORE, { externalId: PRODUCT_ID, plainText: "x" }),
    );

    expect(isMarketplaceAuthError(error)).toBe(true);
  });

  it("treats the reused 36009004 code as a plain refusal when it is not about the token", async () => {
    const { connector } = setup({
      [`GET ${API}/authorization/202309/shops`]: () =>
        jsonResponse(refusal(36009004, "Invalid timestamp.")),
    });

    const error = await caught(
      connector.updateDescription(STORE, { externalId: PRODUCT_ID, plainText: "x" }),
    );

    expect(isMarketplaceAuthError(error)).toBe(false);
    expect(isAppError(error) && error.message).toMatch(/código 36009004/);
  });

  it("retries later on the rate limit code", async () => {
    const { connector } = setup({
      [`GET ${API}/authorization/202309/shops`]: () =>
        jsonResponse(refusal(36009002, "Too many requests")),
    });

    const error = await caught(
      connector.updateDescription(STORE, { externalId: PRODUCT_ID, plainText: "x" }),
    );

    expect(isRetryableError(error)).toBe(true);
  });

  it("is refused by the gateway when the signature is wrong", async () => {
    const api = fakeTikTokShop({
      [`GET ${API}/authorization/202309/shops`]: () => jsonResponse(SHOPS_RESPONSE),
    });
    const connector = createTikTokShopConnector({
      appKey: APP_KEY,
      appSecret: "another-secret",
      serviceId: "1",
      fetchImplementation: api.fetchImplementation,
      retry: { retries: 0 },
      now: () => NOW,
    });

    const error = await caught(
      connector.updateDescription(STORE, { externalId: PRODUCT_ID, plainText: "x" }),
    );

    expect(isAppError(error) && error.message).toMatch(/código 106001/);
  });
});

describe("TikTok Shop orders before their reading exists", () => {
  it("answers orders and webhooks as not available yet", async () => {
    const { connector, calls } = setup();

    const error = await caught(connector.listOrders(STORE, NOW));
    const webhook = await connector.verifyWebhook({ headers: new Headers(), rawBody: "{}" });

    expect(isAppError(error) && error.message).toMatch(/ainda não está disponível/);
    expect(webhook.valid).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
