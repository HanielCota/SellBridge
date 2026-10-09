import { describe, expect, it, vi } from "vitest";
import { createMercadoLivreConnector } from "./mercado-livre-connector.ts";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
  authorization: string | null;
}

type Responder = (request: Recorded) => Response;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (input instanceof Request) {
    return input.url;
  }
  return input.toString();
}

function requestBody(body: RequestInit["body"]): string | null {
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  return null;
}

function fakeApi(routes: Record<string, Responder>) {
  const calls: Recorded[] = [];
  const fetchImplementation = vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    const headers = new Headers(init?.headers);
    const body = requestBody(init?.body);
    const request = {
      method: init?.method ?? "GET",
      url,
      body,
      authorization: headers.get("authorization"),
    };
    calls.push(request);
    const key = Object.keys(routes).find((route) => {
      const [method, path] = route.split(" ");
      return method === request.method && path !== undefined && url.startsWith(path);
    });
    const responder = key ? routes[key] : undefined;
    if (!responder) {
      return json(404, { message: `rota não mapeada ${request.method} ${url}` });
    }
    return responder(request);
  });
  return { fetchImplementation, calls };
}

const API = "https://api.mercadolibre.com";
const fixedNow = new Date("2026-01-01T00:00:00Z");

function connector(routes: Record<string, Responder>) {
  const api = fakeApi(routes);
  return {
    ...api,
    ml: createMercadoLivreConnector({
      clientId: "123456",
      clientSecret: "segredo",
      fetchImplementation: api.fetchImplementation,
      retry: { sleep: async () => {}, random: () => 0 },
      now: () => fixedNow,
    }),
  };
}

const store = { externalShopId: "999", accessToken: "APP_USR-token" };

describe("configuration", () => {
  it("is unavailable without credentials", () => {
    expect(
      createMercadoLivreConnector({ clientId: undefined, clientSecret: undefined }).isConfigured(),
    ).toBe(false);
  });
});

describe("OAuth", () => {
  it("builds the documented authorization URL with PKCE", () => {
    const { ml } = connector({});
    const url = new URL(
      ml.getAuthorizationUrl({
        state: "st",
        redirectUri: "https://app/cb",
        codeVerifier: "verifier",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://auth.mercadolivre.com.br/authorization");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "123456",
      redirect_uri: "https://app/cb",
      state: "st",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("code_challenge")).not.toBe("verifier");
  });

  it("exchanges the code (form-urlencoded) and loads the seller", async () => {
    const { ml, calls } = connector({
      [`POST ${API}/oauth/token`]: () =>
        json(200, {
          access_token: "APP_USR-1",
          expires_in: 21600,
          user_id: 999,
          refresh_token: "TG-1",
        }),
      [`GET ${API}/users/me`]: () => json(200, { id: 999, nickname: "LOJA_ANA" }),
    });
    const result = await ml.exchangeCode({
      code: "TG-code",
      redirectUri: "https://app/cb",
      codeVerifier: "v",
    });
    expect(result.shop).toEqual({ externalShopId: "999", shopName: "LOJA_ANA" });
    expect(result.tokens.expiresAt?.toISOString()).toBe("2026-01-01T06:00:00.000Z");
    const tokenBody = new URLSearchParams(calls[0]?.body ?? "");
    expect(Object.fromEntries(tokenBody)).toMatchObject({
      grant_type: "authorization_code",
      client_id: "123456",
      client_secret: "segredo",
      code: "TG-code",
      code_verifier: "v",
    });
    expect(calls[1]?.authorization).toBe("Bearer APP_USR-1");
  });

  it("maps invalid_grant on refresh to a reconnect error", async () => {
    const { ml } = connector({
      [`POST ${API}/oauth/token`]: () => json(400, { error: "invalid_grant", message: "expired" }),
    });
    await expect(ml.refreshTokens("TG-old")).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER_AUTH",
    });
  });

  it("returns the rotated refresh token", async () => {
    const { ml } = connector({
      [`POST ${API}/oauth/token`]: () =>
        json(200, {
          access_token: "APP_USR-2",
          expires_in: 21600,
          user_id: 999,
          refresh_token: "TG-new",
        }),
    });
    expect((await ml.refreshTokens("TG-old")).refreshToken).toBe("TG-new");
  });
});

const product = {
  idempotencyKey: "l1:s1",
  title: "Camiseta de algodão básica com gola redonda e manga curta muito confortável",
  description: "Descrição do produto",
  priceCents: 4990,
  stock: 12,
  sku: "SKU-1",
  imageUrls: ["https://img/1.jpg"],
};

describe("publishing", () => {
  it("predicts the category, creates the item and sends the description", async () => {
    const { ml, calls } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () =>
        json(200, [{ category_id: "MLB31447" }]),
      [`POST ${API}/items/MLB1/description`]: () => json(201, {}),
      [`POST ${API}/items`]: () => json(201, { id: "MLB1", permalink: "https://produto/MLB1" }),
    });
    const result = await ml.publishProduct(store, product);
    expect(result).toEqual({ externalId: "MLB1", externalUrl: "https://produto/MLB1" });
    const created = JSON.parse(calls.find((call) => call.url === `${API}/items`)?.body ?? "{}");
    expect(created).toMatchObject({
      category_id: "MLB31447",
      price: 49.9,
      currency_id: "BRL",
      available_quantity: 12,
      buying_mode: "buy_it_now",
      pictures: [{ source: "https://img/1.jpg" }],
      attributes: [{ id: "SELLER_SKU", value_name: "SKU-1" }],
    });
    expect(created.title).toHaveLength(60);
    expect(calls.at(-1)?.body).toBe(JSON.stringify({ plain_text: "Descrição do produto" }));
  });

  it("fails without retry when no category is suggested", async () => {
    const { ml } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () => json(200, []),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      details: { retryable: false },
    });
  });

  it("surfaces validation messages as permanent errors", async () => {
    const { ml } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () => json(200, [{ category_id: "MLB1" }]),
      [`POST ${API}/items`]: () => json(400, { message: "attribute BRAND is required" }),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      details: { retryable: false },
      message: "Mercado Livre recusou a operação: attribute BRAND is required",
    });
  });

  it("marks rate limiting as retryable after the HTTP retries run out", async () => {
    const { ml, fetchImplementation } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () =>
        json(429, { error: "local_rate_limited" }),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      details: { retryable: true, status: 429 },
    });
    expect(fetchImplementation.mock.calls.length).toBeGreaterThan(1);
  });

  it("treats 401 as revoked access", async () => {
    const { ml } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () => json(401, {}),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER_AUTH",
    });
  });

  it("updates price and stock with PUT and skips empty updates", async () => {
    const { ml, calls } = connector({ [`PUT ${API}/items/MLB1`]: () => json(200, {}) });
    await ml.updateStockPrice(store, { externalId: "MLB1", priceCents: 5990, stock: 3 });
    await ml.updateStockPrice(store, { externalId: "MLB1" });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({ price: 59.9, available_quantity: 3 });
  });
});

const rawOrder = {
  id: 2000003508897196,
  status: "paid",
  date_created: "2026-03-01T10:00:00.000-03:00",
  total_amount: 100,
  buyer: { nickname: "COMPRADOR" },
  order_items: [
    { item: { id: "MLB1", title: "Camiseta" }, quantity: 2, unit_price: 50, sale_fee: 6 },
  ],
};

describe("orders", () => {
  it("fetches an order from a webhook resource and maps it", async () => {
    const { ml } = connector({ [`GET ${API}/orders/2000003508897196`]: () => json(200, rawOrder) });
    const order = await ml.fetchOrder(store, "/orders/2000003508897196");
    expect(order).toMatchObject({
      externalOrderId: "2000003508897196",
      status: "paid",
      totalCents: 10_000,
      marketplaceFeeCents: 1200,
      buyerName: "COMPRADOR",
      items: [{ externalListingId: "MLB1", quantity: 2, unitPriceCents: 5000 }],
    });
    expect(order.orderedAt.toISOString()).toBe("2026-03-01T13:00:00.000Z");
  });

  it("rejects unknown resources and unexpected payloads", async () => {
    const { ml } = connector({ [`GET ${API}/orders/1`]: () => json(200, { id: 1 }) });
    await expect(ml.fetchOrder(store, "/items/MLB1")).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
    });
    await expect(ml.fetchOrder(store, "/orders/1")).rejects.toMatchObject({
      message: "Resposta inesperada do Mercado Livre",
    });
  });

  it("maps unknown statuses to pending and cancellations", async () => {
    const { ml } = connector({
      [`GET ${API}/orders/search`]: () =>
        json(200, {
          results: [
            { ...rawOrder, id: 1, status: "payment_in_process" },
            { ...rawOrder, id: 2, status: "cancelled" },
            { ...rawOrder, id: 3, status: "something_new" },
          ],
          paging: { total: 3, offset: 0, limit: 50 },
        }),
    });
    const orders = await ml.listOrders(store, new Date("2026-03-01T00:00:00Z"));
    expect(orders.map((order) => order.status)).toEqual(["pending", "cancelled", "pending"]);
  });
});

describe("notifications", () => {
  const notification = {
    _id: "evt-1",
    resource: "/orders/2000003508897196",
    user_id: 999,
    topic: "orders_v2",
    application_id: 123456,
    attempts: 1,
    sent: "2026-03-01T13:00:00.000Z",
    received: "2026-03-01T13:00:00.000Z",
  };

  it("accepts notifications for our application", async () => {
    const { ml } = connector({});
    const result = await ml.verifyWebhook({
      headers: new Headers(),
      rawBody: JSON.stringify(notification),
    });
    expect(result).toMatchObject({
      valid: true,
      event: { externalEventId: "evt-1", topic: "orders_v2", externalShopId: "999" },
    });
  });

  it("rejects other applications and malformed bodies", async () => {
    const { ml } = connector({});
    const other = await ml.verifyWebhook({
      headers: new Headers(),
      rawBody: JSON.stringify({ ...notification, application_id: 1 }),
    });
    expect(other).toMatchObject({ valid: false });
    const malformed = await ml.verifyWebhook({ headers: new Headers(), rawBody: "not json" });
    expect(malformed).toMatchObject({ valid: false, payload: null });
  });

  it("reads the seller and order from stored order notifications", () => {
    const { ml } = connector({});
    expect(ml.parseStoredOrderEvent("orders_v2", notification)).toEqual({
      kind: "order",
      externalShopId: "999",
      resource: "/orders/2000003508897196",
    });
    expect(ml.parseStoredOrderEvent("orders_v2", { resource: "/orders/1" })).toEqual({
      kind: "incomplete",
    });
    expect(ml.parseStoredOrderEvent("items", notification)).toBeNull();
  });
});
