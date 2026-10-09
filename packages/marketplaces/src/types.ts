import type { Cents } from "@sellbridge/shared/money";

export type MarketplaceId = "mock" | "mercado_livre" | "shopee" | "tiktok_shop";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute expiration; null when the marketplace does not expire tokens. */
  expiresAt: Date | null;
}

export interface ConnectedShop {
  externalShopId: string;
  shopName: string;
}

export interface AuthorizationRequest {
  state: string;
  redirectUri: string;
  /** PKCE verifier, when the marketplace requires it. */
  codeVerifier?: string | undefined;
}

export interface CodeExchange {
  code: string;
  redirectUri: string;
  codeVerifier?: string | undefined;
}

export interface PublishProductInput {
  idempotencyKey: string;
  title: string;
  description: string;
  priceCents: Cents;
  stock: number;
  sku: string;
  imageUrls: readonly string[];
}

export interface PublishedListing {
  externalId: string;
  externalUrl: string | null;
}

export interface StockPriceUpdate {
  externalId: string;
  priceCents?: Cents | undefined;
  stock?: number | undefined;
}

export interface MarketplaceOrderItem {
  externalListingId: string;
  title: string;
  quantity: number;
  unitPriceCents: Cents;
}

export interface MarketplaceOrder {
  externalOrderId: string;
  status: "pending" | "paid" | "shipped" | "delivered" | "cancelled" | "returned";
  totalCents: Cents;
  marketplaceFeeCents: Cents;
  buyerName: string | null;
  orderedAt: Date;
  items: MarketplaceOrderItem[];
}

export interface WebhookRequest {
  headers: Headers;
  rawBody: string;
}

export interface ParsedWebhookEvent {
  externalEventId: string;
  topic: string;
  /** Shop that the event belongs to, used to find the store connection. */
  externalShopId: string | null;
  /** Resource referenced by the event (order id, item id...), when present. */
  resource: string | null;
  payload: unknown;
}

export type WebhookVerification =
  { valid: true; event: ParsedWebhookEvent } | { valid: false; reason: string; payload: unknown };

/** Credentials available to an operation on behalf of a connected store. */
export interface StoreCredentials {
  externalShopId: string;
  accessToken: string;
}

/**
 * Single contract every marketplace integration implements. The web app and the
 * worker only talk to marketplaces through this interface.
 */
export interface MarketplaceConnector {
  readonly id: MarketplaceId;
  readonly displayName: string;
  /** False when required credentials are missing; the UI shows "em breve". */
  isConfigured(): boolean;
  getAuthorizationUrl(request: AuthorizationRequest): string;
  exchangeCode(exchange: CodeExchange): Promise<{ tokens: OAuthTokens; shop: ConnectedShop }>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  publishProduct(
    credentials: StoreCredentials,
    input: PublishProductInput,
  ): Promise<PublishedListing>;
  updateStockPrice(credentials: StoreCredentials, update: StockPriceUpdate): Promise<void>;
  listOrders(credentials: StoreCredentials, since: Date): Promise<MarketplaceOrder[]>;
  /** Loads one order referenced by a webhook `resource` (the payload itself is never trusted). */
  fetchOrder(credentials: StoreCredentials, resource: string): Promise<MarketplaceOrder>;
  verifyWebhook(request: WebhookRequest): Promise<WebhookVerification>;
}
