import { describe, expect, it, vi } from "vitest";
import { createMercadoLivreConnector } from "./mercado-livre-connector.ts";
import { ERROR_FIXTURES } from "./fixtures/errors.ts";

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
    const key = Object.keys(routes)
      .toSorted((left, right) => right.length - left.length)
      .find((route) => {
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
  const api = fakeApi({
    [`GET ${API}/users/999/items/search`]: () => json(200, { results: [], paging: { total: 0 } }),
    [`GET ${API}/users/999`]: () => json(200, { tags: [] }),
    [`GET ${API}/categories/`]: () => json(200, []),
    ...routes,
  });
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

describe("descriptions", () => {
  it("publishes the item and reports a description the marketplace refused", async () => {
    const { ml } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () => json(200, [{ category_id: "MLB1" }]),
      [`POST ${API}/items/MLB1/description`]: () =>
        json(400, ERROR_FIXTURES.descriptionNotPlainText),
      [`POST ${API}/items`]: () => json(201, { id: "MLB1", permalink: null }),
    });
    const result = await ml.publishProduct(store, product);
    expect(result).toMatchObject({ externalId: "MLB1" });
    expect(result.descriptionError).toMatch(/^A descrição tem caracteres que o Mercado Livre/);
  });

  it("reports no description error when it goes through", async () => {
    const { ml } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () => json(200, [{ category_id: "MLB1" }]),
      [`POST ${API}/items/MLB1/description`]: () => json(201, {}),
      [`POST ${API}/items`]: () => json(201, { id: "MLB1", permalink: null }),
    });
    expect((await ml.publishProduct(store, product)).descriptionError).toBeNull();
  });

  it("replaces a description with PUT, as the official page says", async () => {
    const { ml, calls } = connector({
      [`PUT ${API}/items/MLB9/description`]: () => json(200, {}),
    });
    await ml.updateDescription(store, { externalId: "MLB9", plainText: "Texto novo" });
    const call = calls.find((recorded) => recorded.method === "PUT");
    expect(call?.url).toBe(`${API}/items/MLB9/description?api_version=2`);
    expect(JSON.parse(call?.body ?? "{}")).toEqual({ plain_text: "Texto novo" });
  });

  it("refuses a resend with the reason in Portuguese", async () => {
    const { ml } = connector({
      [`PUT ${API}/items/MLB9/description`]: () =>
        json(400, ERROR_FIXTURES.descriptionNotPlainText),
    });
    await expect(
      ml.updateDescription(store, { externalId: "MLB9", plainText: "Texto < br > 😀" }),
    ).rejects.toMatchObject({
      details: { retryable: false },
      message: expect.stringMatching(/^A descrição tem caracteres/),
    });
  });
});

describe("publishing", () => {
  it("predicts the category, creates the item and sends the description", async () => {
    const { ml, calls } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () =>
        json(200, [{ category_id: "MLB31447" }]),
      [`POST ${API}/items/MLB1/description`]: () => json(201, {}),
      [`POST ${API}/items`]: () =>
        json(201, { id: "MLB1", permalink: "https://produto.mercadolivre.com.br/MLB-1" }),
    });
    const result = await ml.publishProduct(store, product);
    expect(result).toEqual({
      externalId: "MLB1",
      externalUrl: "https://produto.mercadolivre.com.br/MLB-1",
      descriptionError: null,
    });
    const created = JSON.parse(calls.find((call) => call.url === `${API}/items`)?.body ?? "{}");
    expect(created).toMatchObject({
      category_id: "MLB31447",
      seller_custom_field: product.idempotencyKey,
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

  it("translates the validation causes of a refused item, with what to do", async () => {
    const { ml } = connector({
      [`GET ${API}/sites/MLB/domain_discovery/search`]: () => json(200, [{ category_id: "MLB1" }]),
      [`POST ${API}/items`]: () => json(400, ERROR_FIXTURES.missingRequiredAttributes),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      details: {
        retryable: false,
        status: 400,
        causes: ["item.attributes.missing_required"],
      },
      message: expect.stringMatching(
        /^Faltam atributos obrigatórios .*: BRAND, MODEL\. Preencha esses campos/,
      ),
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
  seller: { id: 999 },
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

  it("refuses an order sold by another seller as final", async () => {
    const foreignOrder = { ...rawOrder, seller: { id: 123 } };
    const { ml } = connector({
      [`GET ${API}/orders/2000003508897196`]: () => json(200, foreignOrder),
    });
    await expect(ml.fetchOrder(store, "/orders/2000003508897196")).rejects.toMatchObject({
      message: "Pedido não pertence à loja conectada",
      details: { retryable: false },
    });
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

  // Regression: the unsigned notification was stored whole, so a forged post padded with 60 KB
  // of extra fields grew the events table by 60 KB a request.
  it("keeps only the documented fields of the notification", async () => {
    const { ml } = connector({});
    const result = await ml.verifyWebhook({
      headers: new Headers(),
      rawBody: JSON.stringify({ ...notification, pad: "x".repeat(60_000) }),
    });
    expect(result.valid && result.event.payload).toEqual(notification);
  });

  it.each([
    ["an _id", { _id: "x".repeat(129) }],
    ["a topic", { topic: "x".repeat(65) }],
    ["a resource", { resource: `/orders/${"9".repeat(250)}` }],
  ])("refuses %s longer than any real notification", async (_field, override) => {
    const { ml } = connector({});
    const result = await ml.verifyWebhook({
      headers: new Headers(),
      rawBody: JSON.stringify({ ...notification, ...override }),
    });
    expect(result.valid).toBe(false);
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

  it("still processes stored events with the legacy orders topic", () => {
    const { ml } = connector({});
    expect(ml.parseStoredOrderEvent("orders", notification)).toMatchObject({ kind: "order" });
  });
});

const publishRoutes: Record<string, Responder> = {
  [`GET ${API}/sites/MLB/domain_discovery/search`]: () => json(200, [{ category_id: "MLB1" }]),
  [`POST ${API}/items`]: () => json(201, { id: "MLB1" }),
  [`POST ${API}/items/MLB1/description`]: () => json(201, {}),
};

/** `minutesAgo`: when an earlier attempt began creating the item; omitted when none did. */
function publicationGuard(minutesAgo?: number) {
  return {
    creationStartedAt:
      minutesAgo === undefined ? null : new Date(fixedNow.getTime() - minutesAgo * 60_000),
    beforeCreate: vi.fn<() => Promise<void>>(async () => {}),
    creationRejected: vi.fn<() => Promise<void>>(async () => {}),
    creationAbsent: vi.fn<() => Promise<void>>(async () => {}),
  };
}

describe("Mercado Livre category requirements", () => {
  it("sends real category attributes, preserving the product SKU", async () => {
    const { ml, calls } = connector({
      ...publishRoutes,
      [`GET ${API}/categories/MLB1/attributes`]: () =>
        json(200, [
          { id: "BRAND", name: "Marca", tags: { required: true } },
          { id: "MODEL", name: "Modelo", tags: { new_required: true } },
        ]),
    });
    await ml.publishProduct(store, {
      ...product,
      mercadoLivreAttributes: { BRAND: "Acme", MODEL: "A1", SELLER_SKU: "override" },
    });
    expect(
      JSON.parse(calls.find((call) => call.url === `${API}/items`)?.body ?? "{}").attributes,
    ).toEqual([
      { id: "BRAND", value_name: "Acme" },
      { id: "MODEL", value_name: "A1" },
      { id: "SELLER_SKU", value_name: product.sku },
    ]);
  });

  it("reports missing required and new_required attributes before creating", async () => {
    const guard = publicationGuard();
    const { ml, calls } = connector({
      ...publishRoutes,
      [`GET ${API}/categories/MLB1/attributes`]: () =>
        json(200, [
          { id: "BRAND", name: "Marca", tags: { required: true } },
          { id: "MODEL", name: "Modelo", tags: { new_required: true } },
        ]),
    });
    await expect(ml.publishProduct(store, product, guard)).rejects.toMatchObject({
      details: { retryable: false },
      message: expect.stringContaining("Marca (BRAND), Modelo (MODEL)"),
    });
    expect(calls.some((call) => call.method === "POST" && call.url === `${API}/items`)).toBe(false);
    expect(guard.beforeCreate).not.toHaveBeenCalled();
  });

  it.each([{ required: [] }, { required: [{ id: "GTIN", name: "Código universal" }] }])(
    "checks conditional exceptions: %j",
    async ({ required }) => {
      const { ml, calls } = connector({
        ...publishRoutes,
        [`GET ${API}/categories/MLB1/attributes`]: () =>
          json(200, [
            { id: "GTIN", name: "Código universal", tags: { conditional_required: true } },
          ]),
        [`POST ${API}/categories/MLB1/attributes/conditional`]: () =>
          json(200, { required_attributes: required }),
      });
      const publication = ml.publishProduct(store, product);
      let outcome: { id?: string; error?: string };
      try {
        outcome = { id: (await publication).externalId };
      } catch (error) {
        outcome = { error: String(error) };
      }
      expect(outcome.error?.includes("GTIN") ?? false).toBe(required.length > 0);
      expect(outcome.id).toBe(required.length ? undefined : "MLB1");
      const validation = calls.find((call) => call.url.endsWith("/attributes/conditional"));
      expect(JSON.parse(validation?.body ?? "{}")).toMatchObject({
        category_id: "MLB1",
        price: 49.9,
        attributes: [{ id: "SELLER_SKU", value_name: product.sku }],
      });
    },
  );

  it("blocks publication when category metadata is unavailable", async () => {
    const { ml, calls } = connector({
      ...publishRoutes,
      [`GET ${API}/categories/MLB1/attributes`]: () => json(500, {}),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      details: { retryable: true },
    });
    expect(calls.some((call) => call.url === `${API}/items`)).toBe(false);
  });
});

describe("User Products", () => {
  it("detects the seller tag and sends family_name without title or variations", async () => {
    const { ml, calls } = connector({
      ...publishRoutes,
      [`GET ${API}/users/999`]: () => json(200, { tags: ["user_product_seller"] }),
    });
    await ml.publishProduct(store, product);
    const created = JSON.parse(calls.find((call) => call.url === `${API}/items`)?.body ?? "{}");
    expect(created.family_name).toBe(product.title.slice(0, 60));
    expect(created).not.toHaveProperty("title");
    expect(created).not.toHaveProperty("variations");
  });
});

const remoteItem = {
  id: "MLB1",
  seller_id: 999,
  seller_custom_field: product.idempotencyKey,
  status: "active",
  permalink: "https://produto.mercadolivre.com.br/MLB-1",
};
const recoveryRoutes: Record<string, Responder> = {
  [`GET ${API}/users/999/items/search`]: () =>
    json(200, { results: ["MLB1"], paging: { total: 1 } }),
  [`GET ${API}/items/MLB1`]: () => json(200, remoteItem),
  [`PUT ${API}/items/MLB1`]: () => json(200, {}),
  // The item was created before: it may have its description already, and a second POST is a
  // bad request (official "Descrição de produtos" page), so recovery must replace it with PUT.
  [`POST ${API}/items/MLB1/description`]: () =>
    json(400, { message: "Item already has a description", error: "bad_request", status: 400 }),
  [`PUT ${API}/items/MLB1/description`]: () => json(200, {}),
};

describe("publication recovery", () => {
  it("replaces the description of a recovered item instead of creating it again", async () => {
    const { ml, calls } = connector(recoveryRoutes);
    const result = await ml.publishProduct(store, product, publicationGuard(30));
    expect(result.descriptionError).toBeNull();
    expect(
      calls.some(
        (call) => call.method === "PUT" && call.url.startsWith(`${API}/items/MLB1/description`),
      ),
    ).toBe(true);
    expect(calls.some((call) => call.method === "POST" && call.url.includes("/description"))).toBe(
      false,
    );
  });

  it("recovers the exact target and syncs price and stock without creating again", async () => {
    const guard = publicationGuard(30);
    const { ml, calls } = connector(recoveryRoutes);
    await expect(ml.publishProduct(store, product, guard)).resolves.toEqual({
      externalId: "MLB1",
      externalUrl: remoteItem.permalink,
      descriptionError: null,
    });
    expect(
      calls.filter((call) => call.method === "GET" && call.url.includes("/items/search")),
    ).toHaveLength(2);
    expect(
      calls.some((call) => new URL(call.url).searchParams.get("seller_sku") === product.sku),
    ).toBe(true);
    expect(
      calls.some((call) => new URL(call.url).searchParams.get("sku") === product.idempotencyKey),
    ).toBe(true);
    expect(calls.find((call) => call.method === "PUT")?.body).toBe(
      JSON.stringify({ price: 49.9, available_quantity: 12 }),
    );
    expect(calls.some((call) => call.url === `${API}/items`)).toBe(false);
    expect(guard.beforeCreate).not.toHaveBeenCalled();
  });

  it("does not adopt a different SellBridge target with the same product SKU", async () => {
    const { ml, calls } = connector({
      ...publishRoutes,
      ...recoveryRoutes,
      [`GET ${API}/items/MLB1`]: () =>
        json(200, { ...remoteItem, seller_custom_field: "another-target" }),
    });
    await ml.publishProduct(store, product);
    expect(calls.some((call) => call.method === "POST" && call.url === `${API}/items`)).toBe(true);
  });

  it.each([{ seller_id: 123 }, { seller_custom_field: null }, { status: "closed" }])(
    "refuses unsafe recovery: %j",
    async (overrides) => {
      const { ml, calls } = connector({
        ...recoveryRoutes,
        [`GET ${API}/items/MLB1`]: () => json(200, { ...remoteItem, ...overrides }),
      });
      await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
        details: { retryable: false },
      });
      expect(calls.some((call) => call.url === `${API}/items`)).toBe(false);
    },
  );

  it("refuses multiple exact matches", async () => {
    const { ml } = connector({
      ...recoveryRoutes,
      [`GET ${API}/users/999/items/search`]: () =>
        json(200, { results: ["MLB1", "MLB2"], paging: { total: 2 } }),
      [`GET ${API}/items/MLB2`]: () => json(200, { ...remoteItem, id: "MLB2" }),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      message: expect.stringContaining("duplicados"),
    });
  });

  it("blocks incomplete search results instead of risking duplicates", async () => {
    const { ml } = connector({
      [`GET ${API}/users/999/items/search`]: () =>
        json(200, { results: [], paging: { total: 51 } }),
    });
    await expect(ml.publishProduct(store, product)).rejects.toMatchObject({
      details: { retryable: false },
    });
  });

  it("does not create within 10 minutes of an uncertain attempt, even if search finds nothing", async () => {
    const guard = publicationGuard(9);
    const { ml, calls } = connector(publishRoutes);
    await expect(ml.publishProduct(store, product, guard)).rejects.toMatchObject({
      message: expect.stringMatching(/aguarde alguns minutos/i),
      details: { retryable: false },
    });
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(guard.creationAbsent).not.toHaveBeenCalled();
  });

  it("clears the guard and creates once 10 minutes passed with no item found", async () => {
    const guard = publicationGuard(10);
    const order: string[] = [];
    guard.creationAbsent.mockImplementationOnce(async () => {
      order.push("absent");
    });
    guard.beforeCreate.mockImplementationOnce(async () => {
      order.push("guard");
    });
    const { ml, calls } = connector(publishRoutes);
    await expect(ml.publishProduct(store, product, guard)).resolves.toMatchObject({
      externalId: "MLB1",
    });
    expect(order).toEqual(["absent", "guard"]);
    expect(
      calls.filter((call) => call.method === "POST" && call.url === `${API}/items`),
    ).toHaveLength(1);
  });

  it("does not report a missing item when a fresh publication finds none", async () => {
    const guard = publicationGuard();
    const { ml } = connector(publishRoutes);
    await ml.publishProduct(store, product, guard);
    expect(guard.creationAbsent).not.toHaveBeenCalled();
  });

  const creationFailures: [string, Responder][] = [
    [
      "timeout",
      () => {
        throw new DOMException("tempo esgotado", "TimeoutError");
      },
    ],
    ["HTTP 500", () => json(500, {})],
    ["HTTP 502", () => json(502, {})],
  ];
  it.each(creationFailures)(
    "after a %s on creation: waits, then creates or adopts",
    async (_label, failure) => {
      const failed = publicationGuard();
      const first = connector({ ...publishRoutes, [`POST ${API}/items`]: failure });
      await expect(first.ml.publishProduct(store, product, failed)).rejects.toMatchObject({
        details: { retryable: false },
      });
      expect(failed.beforeCreate).toHaveBeenCalledOnce();
      expect(failed.creationRejected).not.toHaveBeenCalled();
      expect(first.calls.filter((call) => call.url === `${API}/items`)).toHaveLength(1);

      const retried = connector(publishRoutes);
      await expect(
        retried.ml.publishProduct(store, product, publicationGuard(0)),
      ).rejects.toBeDefined();
      expect(retried.calls.some((call) => call.method === "POST")).toBe(false);

      const neverCreated = connector(publishRoutes);
      await expect(
        neverCreated.ml.publishProduct(store, product, publicationGuard(15)),
      ).resolves.toMatchObject({ externalId: "MLB1" });

      const created = publicationGuard(15);
      const landed = connector({ ...publishRoutes, ...recoveryRoutes });
      await expect(landed.ml.publishProduct(store, product, created)).resolves.toMatchObject({
        externalId: "MLB1",
      });
      expect(
        landed.calls.some((call) => call.method === "POST" && call.url === `${API}/items`),
      ).toBe(false);
      expect(created.creationAbsent).not.toHaveBeenCalled();
    },
  );

  it.each([400, 401, 429, 500])(
    "clears the guard only for definitive refusal: HTTP %i",
    async (status) => {
      const guard = publicationGuard();
      const { ml, calls } = connector({
        ...publishRoutes,
        [`POST ${API}/items`]: () => json(status, {}),
      });
      await expect(ml.publishProduct(store, product, guard)).rejects.toBeDefined();
      expect(guard.beforeCreate).toHaveBeenCalledOnce();
      expect(guard.creationRejected).toHaveBeenCalledTimes(status === 500 ? 0 : 1);
      expect(calls.filter((call) => call.url === `${API}/items`)).toHaveLength(
        status === 429 ? 4 : 1,
      );
    },
  );

  it("retains the guard for network failures and malformed creation responses", async () => {
    for (const responder of [
      () => {
        throw new TypeError("connection lost");
      },
      () => json(201, {}),
    ]) {
      const guard = publicationGuard();
      const { ml } = connector({ ...publishRoutes, [`POST ${API}/items`]: responder });
      await expect(ml.publishProduct(store, product, guard)).rejects.toBeDefined();
      expect(guard.beforeCreate).toHaveBeenCalledOnce();
      expect(guard.creationRejected).not.toHaveBeenCalled();
    }
  });

  it("never posts if saving the durable guard fails", async () => {
    const guard = publicationGuard();
    guard.beforeCreate.mockRejectedValueOnce(new Error("database offline"));
    const { ml, calls } = connector(publishRoutes);
    await expect(ml.publishProduct(store, product, guard)).rejects.toThrow("database offline");
    expect(calls.some((call) => call.url === `${API}/items`)).toBe(false);
  });
});

describe("per-unit sale fees", () => {
  it("adds fees across lines, handles null fees and rounds each unit to cents", async () => {
    const { ml } = connector({
      [`GET ${API}/orders/1`]: () =>
        json(200, {
          ...rawOrder,
          order_items: [
            { ...rawOrder.order_items[0], quantity: 3, sale_fee: 6.01 },
            { ...rawOrder.order_items[0], quantity: 2, sale_fee: 2.33 },
            { ...rawOrder.order_items[0], quantity: 4, sale_fee: null },
          ],
        }),
    });
    expect((await ml.fetchOrder(store, "/orders/1")).marketplaceFeeCents).toBe(2269);
  });

  it("rounds a fee with fractions of a cent once per line, not once per unit", async () => {
    const { ml } = connector({
      [`GET ${API}/orders/1`]: () =>
        json(200, {
          ...rawOrder,
          // R$ 0,004 × 1.000 units is R$ 4,00; rounding each unit first would give zero.
          order_items: [{ ...rawOrder.order_items[0], quantity: 1000, sale_fee: 0.004 }],
        }),
    });
    expect((await ml.fetchOrder(store, "/orders/1")).marketplaceFeeCents).toBe(400);
  });
});

describe("order amounts out of range", () => {
  it.each([
    ["a negative total", { total_amount: -10 }],
    ["a total past what an order row stores", { total_amount: 21_474_836.48 }],
    ["an unreadable date", { date_created: "ontem" }],
  ])("refuses %s as a malformed order", async (_label, change) => {
    const { ml } = connector({
      [`GET ${API}/orders/1`]: () => json(200, { ...rawOrder, ...change }),
    });
    await expect(ml.fetchOrder(store, "/orders/1")).rejects.toThrow("Resposta inesperada");
  });

  it("refuses a negative fee or price on a line", async () => {
    for (const line of [{ sale_fee: -1 }, { unit_price: -0.01 }]) {
      const { ml } = connector({
        [`GET ${API}/orders/1`]: () =>
          json(200, { ...rawOrder, order_items: [{ ...rawOrder.order_items[0], ...line }] }),
      });
      await expect(ml.fetchOrder(store, "/orders/1")).rejects.toThrow("Resposta inesperada");
    }
  });

  it("accepts the largest total an order row stores", async () => {
    const { ml } = connector({
      [`GET ${API}/orders/1`]: () => json(200, { ...rawOrder, total_amount: 21_474_836.47 }),
    });
    expect((await ml.fetchOrder(store, "/orders/1")).totalCents).toBe(2_147_483_647);
  });
});
