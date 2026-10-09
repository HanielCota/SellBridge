import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import type {
  AuthorizationRequest,
  MarketplaceOrder,
  CodeExchange,
  MarketplaceConnector,
  OAuthTokens,
  PublishedListing,
  PublishProductInput,
  StockPriceUpdate,
  StoreCredentials,
  WebhookRequest,
  WebhookVerification,
} from "../types.ts";

/**
 * Fully functional simulated marketplace, used in development, tests and demos.
 * Behaviour is deterministic so tests can trigger each path:
 * - title containing "[falha]"    → permanent rejection (not retried)
 * - title containing "[instavel]" → temporary failure (retried until attempts run out)
 * - price below R$ 5,00           → permanent rejection
 * - refresh token "mock-refresh-revoked" → store must be reconnected
 */
export interface MockConnectorConfig {
  appUrl: string;
  webhookSecret: string;
  /** Simulated network latency; set to 0 in tests. */
  latencyMilliseconds?: number;
  now?: () => Date;
}

const TOKEN_TTL_MILLISECONDS = 6 * 60 * 60 * 1000;
const MIN_PRICE_CENTS = 500;
export const MOCK_REVOKED_REFRESH_TOKEN = "mock-refresh-revoked";
export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

const consentPayloadSchema = z.object({
  shopName: z.string().trim().min(1).max(80),
  nonce: z.string().min(8),
});

const mockOrderSchema = z.object({
  externalOrderId: z.string().min(1),
  status: z.enum(["pending", "paid", "shipped", "delivered", "cancelled", "returned"]),
  totalCents: z.number().int().nonnegative(),
  marketplaceFeeCents: z.number().int().nonnegative(),
  buyerName: z.string().nullable(),
  orderedAt: z.string(),
  items: z
    .array(
      z.object({
        externalListingId: z.string().min(1),
        title: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPriceCents: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export type MockOrder = z.infer<typeof mockOrderSchema>;

/** The simulated marketplace encodes the whole order in the webhook resource. */
export function encodeMockOrderResource(order: MockOrder): string {
  return `mock-order.${Buffer.from(JSON.stringify(order)).toString("base64url")}`;
}

function decodeMockOrderResource(resource: string): MarketplaceOrder {
  if (!resource.startsWith("mock-order.")) {
    throw marketplaceError("Recurso de pedido inválido", { retryable: false });
  }
  const json: unknown = (() => {
    try {
      return JSON.parse(
        Buffer.from(resource.slice("mock-order.".length), "base64url").toString("utf8"),
      );
    } catch {
      return null;
    }
  })();
  const parsed = mockOrderSchema.safeParse(json);
  if (!parsed.success) {
    throw marketplaceError("Pedido simulado em formato inválido", { retryable: false });
  }
  return { ...parsed.data, orderedAt: new Date(parsed.data.orderedAt) };
}

const webhookPayloadSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  shopId: z.string().nullable().optional(),
  resource: z.string().nullable().optional(),
});

export function encodeMockAuthorizationCode(shopName: string): string {
  const payload = { shopName, nonce: randomBytes(8).toString("hex") };
  return `mock.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

function decodeAuthorizationCode(code: string) {
  if (!code.startsWith("mock.")) {
    return null;
  }
  try {
    const json: unknown = JSON.parse(Buffer.from(code.slice(5), "base64url").toString("utf8"));
    const parsed = consentPayloadSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

export function signMockWebhook(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

function assertCredentials(credentials: StoreCredentials): void {
  if (!credentials.accessToken.startsWith("mock-access-")) {
    throw marketplaceAuthError();
  }
}

/** Dependencies shared by the module-level simulated marketplace operations. */
interface MockContext {
  readonly config: MockConnectorConfig;
  readonly now: () => Date;
  readonly latencyMilliseconds: number;
}

async function simulateLatency(context: MockContext): Promise<void> {
  if (context.latencyMilliseconds <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, context.latencyMilliseconds));
}

function issueTokens(context: MockContext): OAuthTokens {
  return {
    accessToken: `mock-access-${randomBytes(12).toString("hex")}`,
    refreshToken: `mock-refresh-${randomBytes(12).toString("hex")}`,
    expiresAt: new Date(context.now().getTime() + TOKEN_TTL_MILLISECONDS),
  };
}

function authorizationUrl(config: MockConnectorConfig, request: AuthorizationRequest): string {
  const url = new URL("/oauth/mock/autorizar", config.appUrl);
  url.searchParams.set("state", request.state);
  url.searchParams.set("redirect_uri", request.redirectUri);
  return url.toString();
}

async function exchangeCode(context: MockContext, exchange: CodeExchange) {
  await simulateLatency(context);
  const consent = decodeAuthorizationCode(exchange.code);
  if (!consent) {
    throw marketplaceError("Código de autorização inválido", {
      retryable: false,
      status: 400,
    });
  }
  return {
    tokens: issueTokens(context),
    shop: {
      externalShopId: stableId("mock-shop", `${consent.shopName}:${consent.nonce}`),
      shopName: consent.shopName,
    },
  };
}

async function refreshTokens(context: MockContext, refreshToken: string): Promise<OAuthTokens> {
  await simulateLatency(context);
  if (refreshToken === MOCK_REVOKED_REFRESH_TOKEN || !refreshToken.startsWith("mock-refresh-")) {
    throw marketplaceAuthError();
  }
  return issueTokens(context);
}

function assertPublishable(input: PublishProductInput): void {
  const title = input.title.toLowerCase();
  if (title.includes("[falha]")) {
    throw marketplaceError("Anúncio recusado: o título contém termos não permitidos", {
      retryable: false,
      status: 422,
    });
  }
  if (title.includes("[instavel]")) {
    throw marketplaceError("Marketplace indisponível no momento", {
      retryable: true,
      status: 503,
    });
  }
  if (input.priceCents < MIN_PRICE_CENTS) {
    throw marketplaceError("Anúncio recusado: o preço mínimo é R$ 5,00", {
      retryable: false,
      status: 422,
    });
  }
}

async function publishProduct(
  context: MockContext,
  credentials: StoreCredentials,
  input: PublishProductInput,
): Promise<PublishedListing> {
  assertCredentials(credentials);
  await simulateLatency(context);
  assertPublishable(input);
  // Same idempotency key → same listing id, so a retried job never duplicates the ad.
  const externalId = stableId("MOCK-ITEM", `${credentials.externalShopId}:${input.idempotencyKey}`);
  return { externalId, externalUrl: `${context.config.appUrl}/oauth/mock/anuncio/${externalId}` };
}

async function updateStockPrice(
  context: MockContext,
  credentials: StoreCredentials,
  update: StockPriceUpdate,
): Promise<void> {
  assertCredentials(credentials);
  await simulateLatency(context);
  if (update.priceCents !== undefined && update.priceCents < MIN_PRICE_CENTS) {
    throw marketplaceError("Preço abaixo do mínimo do marketplace", {
      retryable: false,
      status: 422,
    });
  }
}

async function listOrders(
  context: MockContext,
  credentials: StoreCredentials,
): Promise<MarketplaceOrder[]> {
  assertCredentials(credentials);
  await simulateLatency(context);
  return [];
}

async function fetchOrder(
  context: MockContext,
  credentials: StoreCredentials,
  resource: string,
): Promise<MarketplaceOrder> {
  assertCredentials(credentials);
  await simulateLatency(context);
  return decodeMockOrderResource(resource);
}

function parseWebhookBody(rawBody: string): unknown {
  try {
    const payload: unknown = JSON.parse(rawBody);
    return payload;
  } catch {
    return null;
  }
}

function hasValidSignature(config: MockConnectorConfig, request: WebhookRequest): boolean {
  const signature = request.headers.get(MOCK_SIGNATURE_HEADER);
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(signMockWebhook(request.rawBody, config.webhookSecret), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function verifyWebhook(config: MockConnectorConfig, request: WebhookRequest): WebhookVerification {
  const payload = parseWebhookBody(request.rawBody);
  if (!request.headers.get(MOCK_SIGNATURE_HEADER)) {
    return { valid: false, reason: "Assinatura ausente", payload };
  }
  if (!hasValidSignature(config, request)) {
    return { valid: false, reason: "Assinatura inválida", payload };
  }
  const parsed = webhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { valid: false, reason: "Payload fora do formato esperado", payload };
  }
  return {
    valid: true,
    event: {
      externalEventId: parsed.data.id,
      topic: parsed.data.topic,
      externalShopId: parsed.data.shopId ?? null,
      resource: parsed.data.resource ?? null,
      payload,
    },
  };
}

export function createMockConnector(config: MockConnectorConfig): MarketplaceConnector {
  const context: MockContext = {
    config,
    now: config.now ?? (() => new Date()),
    latencyMilliseconds: config.latencyMilliseconds ?? 400,
  };
  return {
    id: "mock",
    displayName: "Loja simulada",
    isConfigured: () => true,
    getAuthorizationUrl: (request) => authorizationUrl(config, request),
    exchangeCode: async (exchange) => exchangeCode(context, exchange),
    refreshTokens: async (refreshToken) => refreshTokens(context, refreshToken),
    publishProduct: async (credentials, input) => publishProduct(context, credentials, input),
    updateStockPrice: async (credentials, update) => updateStockPrice(context, credentials, update),
    listOrders: async (credentials) => listOrders(context, credentials),
    fetchOrder: async (credentials, resource) => fetchOrder(context, credentials, resource),
    verifyWebhook: async (request) => verifyWebhook(config, request),
  };
}
