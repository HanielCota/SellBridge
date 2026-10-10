import { createHash } from "node:crypto";
import type { AppError } from "@sellbridge/shared/errors";
import { parseJsonText, readJsonBody } from "@sellbridge/shared/http-body";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import { fetchWithRetry, type FetchLike, type RetryOptions } from "../http.ts";
import type {
  AuthorizationRequest,
  CodeExchange,
  MarketplaceConnector,
  MarketplaceOrder,
  OAuthTokens,
  PublishedListing,
  PublishProductInput,
  StockPriceUpdate,
  StoreCredentials,
  WebhookRequest,
  WebhookVerification,
} from "../types.ts";

export interface MercadoLivreConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  fetchImplementation?: FetchLike;
  retry?: Partial<RetryOptions>;
  now?: () => Date;
}

const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const API_URL = "https://api.mercadolibre.com";
const SITE_ID = "MLB";
const MAX_TITLE_LENGTH = 60;
const ORDERS_PAGE_SIZE = 50;
/** Stops paginating order searches after this many results. */
const MAX_ORDERS_FETCHED = 1000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user_id: z.union([z.number(), z.string()]),
  refresh_token: z.string().min(1).optional(),
});

const userSchema = z.object({ id: z.union([z.number(), z.string()]), nickname: z.string() });

const errorBodySchema = z
  .object({ error: z.string().optional(), message: z.string().optional() })
  .passthrough();

const domainDiscoverySchema = z.array(
  z.object({ category_id: z.string().min(1), category_name: z.string().optional() }),
);

const createdItemSchema = z.object({
  id: z.string().min(1),
  permalink: z.string().nullable().optional(),
});

const orderSchema = z.object({
  id: z.union([z.number(), z.string()]),
  status: z.string(),
  date_created: z.string(),
  total_amount: z.number(),
  buyer: z.object({ nickname: z.string().optional() }).nullable().optional(),
  order_items: z.array(
    z.object({
      item: z.object({ id: z.string(), title: z.string() }),
      quantity: z.number().int().positive(),
      unit_price: z.number(),
      sale_fee: z.number().nullable().optional(),
    }),
  ),
});

const ordersSearchSchema = z.object({
  results: z.array(orderSchema),
  paging: z.object({ total: z.number(), offset: z.number(), limit: z.number() }).optional(),
});

const notificationSchema = z.object({
  _id: z.string().min(1),
  resource: z.string().min(1),
  user_id: z.union([z.number(), z.string()]),
  topic: z.string().min(1),
  application_id: z.union([z.number(), z.string()]),
});

const ORDER_STATUS_MAP: Record<string, MarketplaceOrder["status"]> = {
  confirmed: "pending",
  payment_required: "pending",
  payment_in_process: "pending",
  partially_paid: "pending",
  paid: "paid",
  partially_refunded: "paid",
  pending_cancel: "cancelled",
  cancelled: "cancelled",
  invalid: "cancelled",
};

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function mapMercadoLivreOrder(raw: z.infer<typeof orderSchema>): MarketplaceOrder {
  return {
    externalOrderId: String(raw.id),
    status: ORDER_STATUS_MAP[raw.status] ?? "pending",
    totalCents: toCents(raw.total_amount),
    // TODO(sale-fee): the docs only show quantity 1; confirm whether sale_fee is per unit.
    marketplaceFeeCents: raw.order_items.reduce(
      (total, line) => total + toCents((line.sale_fee ?? 0) * line.quantity),
      0,
    ),
    buyerName: raw.buyer?.nickname ?? null,
    orderedAt: new Date(raw.date_created),
    items: raw.order_items.map((line) => ({
      externalListingId: line.item.id,
      title: line.item.title,
      quantity: line.quantity,
      unitPriceCents: toCents(line.unit_price),
    })),
  };
}

async function readError(response: Response): Promise<AppError> {
  const body = errorBodySchema.safeParse(await readJsonBody(response));
  const detail = body.success ? (body.data.message ?? body.data.error ?? "") : "";
  if (response.status === 401 || (body.success && body.data.error === "invalid_grant")) {
    return marketplaceAuthError();
  }
  const retryable = response.status === 429 || response.status >= 500;
  const message = detail
    ? `Mercado Livre recusou a operação: ${detail}`
    : `Mercado Livre respondeu com erro ${response.status}`;
  return marketplaceError(message, { retryable, status: response.status });
}

interface MercadoLivreContext {
  readonly config: MercadoLivreConfig;
  readonly fetchImplementation: FetchLike;
  readonly now: () => Date;
}

interface JsonRequest<TResponse> {
  readonly schema: z.ZodType<TResponse>;
  readonly path: string;
  readonly init?: RequestInit & { accessToken?: string };
}

type TokenWithUser = OAuthTokens & { userId: string };

function credentials(config: MercadoLivreConfig): { clientId: string; clientSecret: string } {
  if (!config.clientId || !config.clientSecret) {
    throw marketplaceError("Integração com o Mercado Livre não configurada", {
      retryable: false,
    });
  }
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

async function requestJson<TResponse>(
  context: MercadoLivreContext,
  request: JsonRequest<TResponse>,
): Promise<TResponse> {
  const { accessToken, ...requestInit } = request.init ?? {};
  const headers = new Headers(requestInit.headers);
  headers.set("accept", "application/json");
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }
  const url = request.path.startsWith("http") ? request.path : `${API_URL}${request.path}`;
  const response = await fetchWithRetry(
    context.fetchImplementation,
    url,
    { ...requestInit, headers },
    context.config.retry,
  );
  if (!response.ok) {
    throw await readError(response);
  }
  const parsed = request.schema.safeParse(await readJsonBody(response));
  if (!parsed.success) {
    throw marketplaceError("Resposta inesperada do Mercado Livre", { retryable: false });
  }
  return parsed.data;
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

function authorizationUrl(config: MercadoLivreConfig, request: AuthorizationRequest): string {
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

async function exchangeCode(context: MercadoLivreContext, exchange: CodeExchange) {
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

async function refreshTokens(
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

async function predictCategory(
  context: MercadoLivreContext,
  prediction: { title: string; accessToken: string },
): Promise<string> {
  const query = new URLSearchParams([
    ["limit", "1"],
    ["q", prediction.title],
  ]);
  const predictions = await requestJson(context, {
    schema: domainDiscoverySchema,
    path: `/sites/${SITE_ID}/domain_discovery/search?${query.toString()}`,
    init: { accessToken: prediction.accessToken },
  });
  const [first] = predictions;
  if (!first) {
    throw marketplaceError(
      "O Mercado Livre não sugeriu uma categoria para este título. Ajuste o título e reprocesse.",
      { retryable: false },
    );
  }
  return first.category_id;
}

function itemBody(input: PublishProductInput, listing: { title: string; categoryId: string }) {
  return {
    title: listing.title,
    category_id: listing.categoryId,
    price: input.priceCents / 100,
    currency_id: "BRL",
    available_quantity: input.stock,
    buying_mode: "buy_it_now",
    condition: "new",
    listing_type_id: "gold_special",
    pictures: input.imageUrls.slice(0, 6).map((source) => ({ source })),
    attributes: [{ id: "SELLER_SKU", value_name: input.sku }],
  };
}

/** The description is optional for the listing: a failure is logged and publishing goes on. */
async function postDescription(
  context: MercadoLivreContext,
  description: { store: StoreCredentials; itemId: string; plainText: string },
): Promise<void> {
  try {
    await requestJson(context, {
      schema: z.unknown(),
      path: `/items/${description.itemId}/description`,
      init: {
        method: "POST",
        accessToken: description.store.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plain_text: description.plainText }),
      },
    });
  } catch (error) {
    logger.warn("mercado_livre.description_failed", {
      error,
      externalShopId: description.store.externalShopId,
      externalId: description.itemId,
    });
  }
}

async function publishProduct(
  context: MercadoLivreContext,
  store: StoreCredentials,
  input: PublishProductInput,
): Promise<PublishedListing> {
  const title = input.title.slice(0, MAX_TITLE_LENGTH);
  const categoryId = await predictCategory(context, { title, accessToken: store.accessToken });
  // TODO(user-products): when the seller account migrates to User Products, the title
  // is no longer sent and the family flow applies (see docs/marketplaces/mercado-livre.md).
  // TODO(attributes): required attributes vary by category (BRAND, MODEL...); today the
  // marketplace rejects with a clear message when one is missing.
  // TODO(idempotency): POST /items is not idempotent; a crash between creating the item
  // and saving its id can duplicate the ad. Confirm a documented lookup by SELLER_SKU.
  const item = await requestJson(context, {
    schema: createdItemSchema,
    path: "/items",
    init: {
      method: "POST",
      accessToken: store.accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(itemBody(input, { title, categoryId })),
    },
  });
  await postDescription(context, { store, itemId: item.id, plainText: input.description });
  return { externalId: item.id, externalUrl: item.permalink ?? null };
}

function stockPriceBody(update: StockPriceUpdate): Record<string, number> {
  const body: Record<string, number> = {};
  if (update.priceCents !== undefined) {
    body.price = update.priceCents / 100;
  }
  if (update.stock !== undefined) {
    body.available_quantity = update.stock;
  }
  return body;
}

async function updateStockPrice(
  context: MercadoLivreContext,
  store: StoreCredentials,
  update: StockPriceUpdate,
): Promise<void> {
  const body = stockPriceBody(update);
  if (Object.keys(body).length === 0) {
    return;
  }
  await requestJson(context, {
    schema: z.unknown(),
    path: `/items/${encodeURIComponent(update.externalId)}`,
    init: {
      method: "PUT",
      accessToken: store.accessToken,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  });
}

async function fetchOrdersPage(
  context: MercadoLivreContext,
  page: { store: StoreCredentials; since: Date; offset: number },
) {
  const query = new URLSearchParams({
    seller: page.store.externalShopId,
    "order.date_created.from": page.since.toISOString(),
    sort: "date_desc",
    offset: String(page.offset),
    limit: String(ORDERS_PAGE_SIZE),
  });
  return requestJson(context, {
    schema: ordersSearchSchema,
    path: `/orders/search?${query.toString()}`,
    init: { accessToken: page.store.accessToken },
  });
}

async function listOrders(
  context: MercadoLivreContext,
  store: StoreCredentials,
  since: Date,
): Promise<MarketplaceOrder[]> {
  const orders: MarketplaceOrder[] = [];
  for (let offset = 0; offset < MAX_ORDERS_FETCHED; offset += ORDERS_PAGE_SIZE) {
    const page = await fetchOrdersPage(context, { store, since, offset });
    orders.push(...page.results.map(mapMercadoLivreOrder));
    const total = page.paging?.total ?? 0;
    if (page.results.length === 0 || offset + ORDERS_PAGE_SIZE >= total) {
      return orders;
    }
  }
  return orders;
}

async function fetchOrder(
  context: MercadoLivreContext,
  store: StoreCredentials,
  resource: string,
): Promise<MarketplaceOrder> {
  const match = /^\/?orders\/(\d+)$/.exec(resource);
  if (!match?.[1]) {
    throw marketplaceError(`Recurso de pedido inválido: ${resource}`, { retryable: false });
  }
  const raw = await requestJson(context, {
    schema: orderSchema,
    path: `/orders/${match[1]}`,
    init: { accessToken: store.accessToken },
  });
  return mapMercadoLivreOrder(raw);
}

function verifyWebhook(config: MercadoLivreConfig, request: WebhookRequest): WebhookVerification {
  const payload = parseJsonText(request.rawBody);
  const parsed = notificationSchema.safeParse(payload);
  if (!parsed.success) {
    return { valid: false, reason: "Notificação fora do formato documentado", payload };
  }
  // Mercado Livre does not sign notifications: accept only our application id and
  // always re-fetch the resource with the store token (the payload is never trusted).
  if (!config.clientId || String(parsed.data.application_id) !== config.clientId) {
    return { valid: false, reason: "application_id não corresponde ao aplicativo", payload };
  }
  return {
    valid: true,
    event: {
      externalEventId: parsed.data["_id"],
      topic: parsed.data.topic,
      externalShopId: String(parsed.data.user_id),
      resource: parsed.data.resource,
      payload,
    },
  };
}

/**
 * Mercado Livre connector. Every endpoint and field used here is documented in
 * docs/marketplaces/mercado-livre.md (official docs, checked on 2026-10-08).
 */
export function createMercadoLivreConnector(config: MercadoLivreConfig): MarketplaceConnector {
  const context: MercadoLivreContext = {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
  return {
    id: "mercado_livre",
    displayName: "Mercado Livre",
    isConfigured: () => Boolean(config.clientId && config.clientSecret),
    getAuthorizationUrl: (request) => authorizationUrl(config, request),
    exchangeCode: async (exchange) => exchangeCode(context, exchange),
    refreshTokens: async (refreshToken) => refreshTokens(context, refreshToken),
    publishProduct: async (store, input) => publishProduct(context, store, input),
    updateStockPrice: async (store, update) => updateStockPrice(context, store, update),
    listOrders: async (store, since) => listOrders(context, store, since),
    fetchOrder: async (store, resource) => fetchOrder(context, store, resource),
    verifyWebhook: async (request) => verifyWebhook(config, request),
  };
}
