import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MarketplaceAuthError, MarketplaceError } from "../errors.ts";
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
  latencyMs?: number;
  now?: () => Date;
}

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
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
    throw new MarketplaceError("Recurso de pedido inválido", { retryable: false });
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
    throw new MarketplaceError("Pedido simulado em formato inválido", { retryable: false });
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
    throw new MarketplaceAuthError();
  }
}

export function createMockConnector(config: MockConnectorConfig): MarketplaceConnector {
  const now = config.now ?? (() => new Date());
  const latencyMs = config.latencyMs ?? 400;

  async function simulateLatency(): Promise<void> {
    if (latencyMs <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
  }

  function issueTokens(): OAuthTokens {
    return {
      accessToken: `mock-access-${randomBytes(12).toString("hex")}`,
      refreshToken: `mock-refresh-${randomBytes(12).toString("hex")}`,
      expiresAt: new Date(now().getTime() + TOKEN_TTL_MS),
    };
  }

  return {
    id: "mock",
    displayName: "Loja simulada",
    isConfigured: () => true,

    getAuthorizationUrl(request: AuthorizationRequest): string {
      const url = new URL("/oauth/mock/autorizar", config.appUrl);
      url.searchParams.set("state", request.state);
      url.searchParams.set("redirect_uri", request.redirectUri);
      return url.toString();
    },

    async exchangeCode(exchange: CodeExchange) {
      await simulateLatency();
      const consent = decodeAuthorizationCode(exchange.code);
      if (!consent) {
        throw new MarketplaceError("Código de autorização inválido", {
          retryable: false,
          status: 400,
        });
      }
      return {
        tokens: issueTokens(),
        shop: {
          externalShopId: stableId("mock-shop", `${consent.shopName}:${consent.nonce}`),
          shopName: consent.shopName,
        },
      };
    },

    async refreshTokens(refreshToken: string) {
      await simulateLatency();
      if (
        refreshToken === MOCK_REVOKED_REFRESH_TOKEN ||
        !refreshToken.startsWith("mock-refresh-")
      ) {
        throw new MarketplaceAuthError();
      }
      return issueTokens();
    },

    async publishProduct(
      credentials: StoreCredentials,
      input: PublishProductInput,
    ): Promise<PublishedListing> {
      assertCredentials(credentials);
      await simulateLatency();
      const title = input.title.toLowerCase();
      if (title.includes("[falha]")) {
        throw new MarketplaceError("Anúncio recusado: o título contém termos não permitidos", {
          retryable: false,
          status: 422,
        });
      }
      if (title.includes("[instavel]")) {
        throw new MarketplaceError("Marketplace indisponível no momento", {
          retryable: true,
          status: 503,
        });
      }
      if (input.priceCents < MIN_PRICE_CENTS) {
        throw new MarketplaceError("Anúncio recusado: o preço mínimo é R$ 5,00", {
          retryable: false,
          status: 422,
        });
      }
      // Same idempotency key → same listing id, so a retried job never duplicates the ad.
      const externalId = stableId(
        "MOCK-ITEM",
        `${credentials.externalShopId}:${input.idempotencyKey}`,
      );
      return { externalId, externalUrl: `${config.appUrl}/oauth/mock/anuncio/${externalId}` };
    },

    async updateStockPrice(credentials: StoreCredentials, update: StockPriceUpdate): Promise<void> {
      assertCredentials(credentials);
      await simulateLatency();
      if (update.priceCents !== undefined && update.priceCents < MIN_PRICE_CENTS) {
        throw new MarketplaceError("Preço abaixo do mínimo do marketplace", {
          retryable: false,
          status: 422,
        });
      }
    },

    async listOrders(credentials: StoreCredentials) {
      assertCredentials(credentials);
      await simulateLatency();
      return [];
    },

    async fetchOrder(credentials: StoreCredentials, resource: string): Promise<MarketplaceOrder> {
      assertCredentials(credentials);
      await simulateLatency();
      return decodeMockOrderResource(resource);
    },

    async verifyWebhook(request: WebhookRequest): Promise<WebhookVerification> {
      const payload: unknown = (() => {
        try {
          return JSON.parse(request.rawBody);
        } catch {
          return null;
        }
      })();
      const signature = request.headers.get(MOCK_SIGNATURE_HEADER);
      if (!signature) {
        return { valid: false, reason: "Assinatura ausente", payload };
      }
      const expected = Buffer.from(signMockWebhook(request.rawBody, config.webhookSecret), "hex");
      const received = Buffer.from(signature, "hex");
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
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
    },
  };
}
