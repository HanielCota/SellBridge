import { createHash } from "node:crypto";
import type { AppError } from "@sellbridge/shared/errors";
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

/**
 * Mercado Livre connector. Every endpoint and field used here is documented in
 * docs/marketplaces/mercado-livre.md (official docs, checked on 2026-10-08).
 */
export interface MercadoLivreConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  fetchImpl?: FetchLike;
  retry?: Partial<RetryOptions>;
  now?: () => Date;
}

const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const API_URL = "https://api.mercadolibre.com";
const SITE_ID = "MLB";
const MAX_TITLE_LENGTH = 60;

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

export function mapMercadoLivreOrder(raw: z.infer<typeof orderSchema>): MarketplaceOrder {
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
  const body = errorBodySchema.safeParse(await response.json().catch(() => null));
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

export function createMercadoLivreConnector(config: MercadoLivreConfig): MarketplaceConnector {
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? (() => new Date());

  function credentials(): { clientId: string; clientSecret: string } {
    if (!config.clientId || !config.clientSecret) {
      throw marketplaceError("Integração com o Mercado Livre não configurada", {
        retryable: false,
      });
    }
    return { clientId: config.clientId, clientSecret: config.clientSecret };
  }

  async function requestJson<T>(
    schema: z.ZodType<T>,
    path: string,
    init: RequestInit & { accessToken?: string } = {},
  ): Promise<T> {
    const { accessToken, ...requestInit } = init;
    const headers = new Headers(requestInit.headers);
    headers.set("accept", "application/json");
    if (accessToken) {
      headers.set("authorization", `Bearer ${accessToken}`);
    }
    const url = path.startsWith("http") ? path : `${API_URL}${path}`;
    const response = await fetchWithRetry(
      fetchImpl,
      url,
      { ...requestInit, headers },
      config.retry,
    );
    if (!response.ok) {
      throw await readError(response);
    }
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw marketplaceError("Resposta inesperada do Mercado Livre", { retryable: false });
    }
    return parsed.data;
  }

  async function requestToken(
    params: Record<string, string>,
  ): Promise<OAuthTokens & { userId: string }> {
    const body = new URLSearchParams(params);
    const token = await requestJson(tokenResponseSchema, "/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: new Date(now().getTime() + token.expires_in * 1000),
      userId: String(token.user_id),
    };
  }

  async function predictCategory(title: string, accessToken: string): Promise<string> {
    const query = new URLSearchParams({ limit: "1", q: title });
    const predictions = await requestJson(
      domainDiscoverySchema,
      `/sites/${SITE_ID}/domain_discovery/search?${query.toString()}`,
      { accessToken },
    );
    const [first] = predictions;
    if (!first) {
      throw marketplaceError(
        "O Mercado Livre não sugeriu uma categoria para este título. Ajuste o título e reprocesse.",
        { retryable: false },
      );
    }
    return first.category_id;
  }

  async function fetchOrderByPath(path: string, accessToken: string): Promise<MarketplaceOrder> {
    return mapMercadoLivreOrder(await requestJson(orderSchema, path, { accessToken }));
  }

  return {
    id: "mercado_livre",
    displayName: "Mercado Livre",
    isConfigured: () => Boolean(config.clientId && config.clientSecret),

    getAuthorizationUrl(request: AuthorizationRequest): string {
      const url = new URL(AUTH_URL);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", credentials().clientId);
      url.searchParams.set("redirect_uri", request.redirectUri);
      url.searchParams.set("state", request.state);
      if (request.codeVerifier) {
        url.searchParams.set("code_challenge", pkceChallenge(request.codeVerifier));
        url.searchParams.set("code_challenge_method", "S256");
      }
      return url.toString();
    },

    async exchangeCode(exchange: CodeExchange) {
      const { clientId, clientSecret } = credentials();
      const token = await requestToken({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: exchange.code,
        redirect_uri: exchange.redirectUri,
        ...(exchange.codeVerifier ? { code_verifier: exchange.codeVerifier } : {}),
      });
      const user = await requestJson(userSchema, "/users/me", { accessToken: token.accessToken });
      const { userId: _userId, ...tokens } = token;
      return { tokens, shop: { externalShopId: String(user.id), shopName: user.nickname } };
    },

    async refreshTokens(refreshToken: string) {
      const { clientId, clientSecret } = credentials();
      const { userId: _userId, ...tokens } = await requestToken({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });
      return tokens;
    },

    async publishProduct(
      store: StoreCredentials,
      input: PublishProductInput,
    ): Promise<PublishedListing> {
      const title = input.title.slice(0, MAX_TITLE_LENGTH);
      const categoryId = await predictCategory(title, store.accessToken);
      // TODO(user-products): when the seller account migrates to User Products, the title
      // is no longer sent and the family flow applies (see docs/marketplaces/mercado-livre.md).
      // TODO(attributes): required attributes vary by category (BRAND, MODEL...); today the
      // marketplace rejects with a clear message when one is missing.
      // TODO(idempotency): POST /items is not idempotent; a crash between creating the item
      // and saving its id can duplicate the ad. Confirm a documented lookup by SELLER_SKU.
      const item = await requestJson(createdItemSchema, "/items", {
        method: "POST",
        accessToken: store.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category_id: categoryId,
          price: input.priceCents / 100,
          currency_id: "BRL",
          available_quantity: input.stock,
          buying_mode: "buy_it_now",
          condition: "new",
          listing_type_id: "gold_special",
          pictures: input.imageUrls.slice(0, 6).map((source) => ({ source })),
          attributes: [{ id: "SELLER_SKU", value_name: input.sku }],
        }),
      });
      await requestJson(z.unknown(), `/items/${item.id}/description`, {
        method: "POST",
        accessToken: store.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plain_text: input.description }),
      }).catch(() => undefined);
      return { externalId: item.id, externalUrl: item.permalink ?? null };
    },

    async updateStockPrice(store: StoreCredentials, update: StockPriceUpdate): Promise<void> {
      const body: Record<string, number> = {};
      if (update.priceCents !== undefined) {
        body.price = update.priceCents / 100;
      }
      if (update.stock !== undefined) {
        body.available_quantity = update.stock;
      }
      if (Object.keys(body).length === 0) {
        return;
      }
      await requestJson(z.unknown(), `/items/${encodeURIComponent(update.externalId)}`, {
        method: "PUT",
        accessToken: store.accessToken,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    },

    async listOrders(store: StoreCredentials, since: Date): Promise<MarketplaceOrder[]> {
      const orders: MarketplaceOrder[] = [];
      for (let offset = 0; offset < 1000; offset += 50) {
        const query = new URLSearchParams({
          seller: store.externalShopId,
          "order.date_created.from": since.toISOString(),
          sort: "date_desc",
          offset: String(offset),
          limit: "50",
        });
        const page = await requestJson(ordersSearchSchema, `/orders/search?${query.toString()}`, {
          accessToken: store.accessToken,
        });
        orders.push(...page.results.map(mapMercadoLivreOrder));
        const total = page.paging?.total ?? 0;
        if (page.results.length === 0 || offset + 50 >= total) {
          return orders;
        }
      }
      return orders;
    },

    async fetchOrder(store: StoreCredentials, resource: string): Promise<MarketplaceOrder> {
      const match = /^\/?orders\/(\d+)$/.exec(resource);
      if (!match?.[1]) {
        throw marketplaceError(`Recurso de pedido inválido: ${resource}`, { retryable: false });
      }
      return fetchOrderByPath(`/orders/${match[1]}`, store.accessToken);
    },

    async verifyWebhook(request: WebhookRequest): Promise<WebhookVerification> {
      const payload: unknown = (() => {
        try {
          return JSON.parse(request.rawBody);
        } catch {
          return null;
        }
      })();
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
    },
  };
}
