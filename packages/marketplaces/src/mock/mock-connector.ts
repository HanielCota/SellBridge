import { createHash, randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { marketplaceError } from "../errors.ts";
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
  StoredOrderEvent,
  WebhookRequest,
  WebhookVerification,
} from "../types.ts";
import { parseJsonText } from "@sellbridge/shared/http-body";
import {
  decodeMockAuthorizationCode,
  decodeMockOrderResource,
  isValidMockSignature,
  MOCK_SIGNATURE_HEADER,
} from "./codec.ts";
import {
  assertCredentials,
  assertPriceAccepted,
  assertPublishable,
  assertRefreshable,
} from "./scenarios.ts";

/**
 * Fully functional simulated marketplace, used in development, tests and demos.
 * Behaviour is deterministic so tests can trigger each path (see scenarios.ts).
 */
export interface MockConnectorConfig {
  appUrl: string;
  webhookSecret: string;
  /** Simulated network latency; set to 0 in tests. */
  latencyMilliseconds?: number;
  now?: () => Date;
}

const TOKEN_TTL_MILLISECONDS = 6 * 60 * 60 * 1000;
/** Webhook topic that carries orders in the simulated marketplace. */
const ORDER_TOPIC = "orders";

const webhookPayloadSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  shopId: z.string().nullable().optional(),
  resource: z.string().nullable().optional(),
});

const storedOrderPayloadSchema = z.object({
  shopId: z.union([z.string(), z.number()]),
  resource: z.string().min(1),
});

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
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
  await delay(context.latencyMilliseconds);
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
  const consent = decodeMockAuthorizationCode(exchange.code);
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
  assertRefreshable(refreshToken);
  return issueTokens(context);
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
  assertPriceAccepted(update);
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

function verifyWebhook(config: MockConnectorConfig, request: WebhookRequest): WebhookVerification {
  const payload = parseJsonText(request.rawBody);
  const signature = request.headers.get(MOCK_SIGNATURE_HEADER);
  if (!signature) {
    return { valid: false, reason: "Assinatura ausente", payload };
  }
  if (!isValidMockSignature(request.rawBody, signature, config.webhookSecret)) {
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

function parseStoredOrderEvent(topic: string, rawPayload: unknown): StoredOrderEvent | null {
  if (topic !== ORDER_TOPIC) {
    return null;
  }
  const parsed = storedOrderPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return { kind: "incomplete" };
  }
  return {
    kind: "order",
    externalShopId: String(parsed.data.shopId),
    resource: parsed.data.resource,
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
    parseStoredOrderEvent,
  };
}
