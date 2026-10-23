import type { Cents } from "@sellbridge/shared/money";
import type { MarketplaceShippingAddress, ShippingAddressReading } from "./shipping-address.ts";

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
  /** Category attribute ids (BRAND, MODEL, GTIN...) and their actual values. */
  mercadoLivreAttributes?: Readonly<Record<string, string>>;
}

export interface PublishOptions {
  /** When an earlier attempt began creating the item (it may have landed); null if none did. */
  creationStartedAt: Date | null;
  beforeCreate: () => Promise<void>;
  /** Only called when the API definitively refused creation. */
  creationRejected: () => Promise<void>;
  /** Reconciliation, past the settle window, found no item: the earlier creation never landed. */
  creationAbsent: () => Promise<void>;
}

export interface PublishedListing {
  externalId: string;
  externalUrl: string | null;
  /**
   * Why the marketplace did not take the description, in the reseller's words; null when it
   * did. The listing is live either way: a missing description never fails a publication.
   */
  descriptionError?: string | null;
}

export interface DescriptionUpdate {
  externalId: string;
  plainText: string;
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
  /**
   * Money already given back to the buyer across the order's payments (latest total); undefined
   * when the source did not report payments this time.
   */
  refundedCents?: Cents | undefined;
  buyerName: string | null;
  /**
   * Where the parcel goes, when the marketplace sends it with the order (validated with
   * `marketplaceShippingAddressSchema`); undefined when it does not. Stored encrypted.
   */
  shippingAddress?: MarketplaceShippingAddress | undefined;
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

/**
 * Order reference read back from a stored webhook payload: the shop that owns the
 * order and the resource to fetch, or "incomplete" when the payload lacks either.
 */
export type StoredOrderEvent =
  { kind: "order"; externalShopId: string; resource: string } | { kind: "incomplete" };

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
    options?: PublishOptions,
  ): Promise<PublishedListing>;
  updateStockPrice(credentials: StoreCredentials, update: StockPriceUpdate): Promise<void>;
  /** Replaces the description of a live listing (the resend of a description that failed). */
  updateDescription(credentials: StoreCredentials, update: DescriptionUpdate): Promise<void>;
  listOrders(credentials: StoreCredentials, since: Date): Promise<MarketplaceOrder[]>;
  /** Loads one order referenced by a webhook `resource` (the payload itself is never trusted). */
  fetchOrder(credentials: StoreCredentials, resource: string): Promise<MarketplaceOrder>;
  verifyWebhook(request: WebhookRequest): Promise<WebhookVerification>;
  /** Reads the order reference of a stored webhook event; null when the topic is not about orders. */
  parseStoredOrderEvent(topic: string, rawPayload: unknown): StoredOrderEvent | null;
  /**
   * Optional: reads an order's shipping address with its own call, for marketplaces that do not
   * send it with the order. Absent means "unavailable" (docs/marketplaces/order-shipping-address.md).
   */
  readShippingAddress?(
    credentials: StoreCredentials,
    externalOrderId: string,
  ): Promise<ShippingAddressReading>;
}
