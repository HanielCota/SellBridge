import type { AppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { z } from "zod";
import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import { fetchWithRetry, type FetchLike, type RetryOptions } from "../http.ts";
import { explainTikTokShopError } from "./error-messages.ts";
import { envelopeSchema, type TikTokShopEnvelope } from "./schemas.ts";
import { signRequest } from "./signing.ts";

/** Every address a host name resolves to; injected in tests. */
export type ResolveHost = (hostname: string) => Promise<string[]>;

export interface TikTokShopConfig {
  appKey: string | undefined;
  appSecret: string | undefined;
  /** Needed only for the authorization link; without it no shop can connect. */
  serviceId: string | undefined;
  fetchImplementation?: FetchLike;
  retry?: Partial<RetryOptions>;
  now?: () => Date;
  resolveHost?: ResolveHost;
}

export interface TikTokShopCredentials {
  readonly appKey: string;
  readonly appSecret: string;
}

/** Dependencies shared by the module-level request helpers. */
export interface TikTokShopContext {
  readonly config: TikTokShopConfig;
  readonly fetchImplementation: FetchLike;
  readonly now: () => Date;
  /** Shop id → cipher, read from Get Authorized Shops (`shops.ts`). */
  readonly shopCiphers: Map<string, { cipher: string; readAt: number }>;
}

export const API_URL = "https://open-api.tiktokglobalshop.com";
export const AUTH_URL = "https://auth.tiktok-shops.com";

function isFilled(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

export function isTikTokShopConfigured(config: TikTokShopConfig): boolean {
  return isFilled(config.appKey) && isFilled(config.appSecret) && isFilled(config.serviceId);
}

export function appCredentials(config: TikTokShopConfig): TikTokShopCredentials {
  if (!isFilled(config.appKey) || !isFilled(config.appSecret)) {
    throw marketplaceError("Integração com o TikTok Shop não configurada", { retryable: false });
  }
  return { appKey: config.appKey, appSecret: config.appSecret };
}

/** Longest marketplace text kept in one log entry. */
const LOGGED_TEXT_LENGTH = 500;

function forLog(text: string | undefined): string | undefined {
  return text?.replace(/\s+/g, " ").slice(0, LOGGED_TEXT_LENGTH);
}

/** Expired credentials, per "Common errors". */
const EXPIRED_TOKEN_CODE = 105002;
/** Reused for many request problems; only with an access-token message is it about the token. */
const INVALID_CREDENTIALS_CODE = 36009004;
/** Refused before being processed: asking again later is safe for any method. */
const RATE_LIMIT_CODES: ReadonlySet<number> = new Set([36009002, 12052109]);
/** Internal error and gateway timeout: may have taken effect on a POST. */
const TRANSIENT_CODES: ReadonlySet<number> = new Set([36009003, 36009007]);

function isTokenRefusal(envelope: TikTokShopEnvelope | null, status: number): boolean {
  if (status === 401 || envelope?.code === EXPIRED_TOKEN_CODE) {
    return true;
  }
  if (envelope?.code !== INVALID_CREDENTIALS_CODE) {
    return false;
  }
  const message = (envelope.message ?? "").toLowerCase();
  return message.includes("access_token") || message.includes("access-token");
}

function isRetryableRefusal(code: number, status: number, isIdempotent: boolean): boolean {
  if (status === 429 || RATE_LIMIT_CODES.has(code)) {
    return true;
  }
  return isIdempotent && (status >= 500 || TRANSIENT_CODES.has(code));
}

/**
 * The refusal as a typed error: a dead token asks for reconnection; a 5xx or internal error on a
 * POST stays permanent, since it may have taken effect (an item created) and must not be repeated.
 */
function refusalError(
  envelope: TikTokShopEnvelope | null,
  status: number,
  isIdempotent: boolean,
): AppError {
  if (isTokenRefusal(envelope, status)) {
    return marketplaceAuthError();
  }
  const code = envelope?.code ?? 0;
  logger.warn("tiktok_shop.refused", {
    status,
    code,
    message: forLog(envelope?.message),
    requestId: forLog(envelope?.request_id),
  });
  return marketplaceError(explainTikTokShopError(code, status), {
    retryable: isRetryableRefusal(code, status, isIdempotent),
    status,
    causes: code === 0 ? [] : [String(code)],
  });
}

async function readEnvelope(response: Response): Promise<TikTokShopEnvelope | null> {
  const text = await response.text();
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Reads the `data` of a successful response; anything else becomes a typed error. */
async function readData<TResponse>(
  response: Response,
  schema: z.ZodType<TResponse>,
  isIdempotent: boolean,
): Promise<TResponse> {
  const envelope = await readEnvelope(response);
  if (!response.ok || envelope === null || envelope.code !== 0) {
    if (response.ok && envelope === null) {
      throw marketplaceError("Resposta inesperada do TikTok Shop", { retryable: false });
    }
    throw refusalError(envelope, response.status, isIdempotent);
  }
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    throw marketplaceError("Resposta inesperada do TikTok Shop", { retryable: false });
  }
  return parsed.data;
}

export interface ShopRequest<TResponse> {
  readonly schema: z.ZodType<TResponse>;
  readonly method: "GET" | "POST";
  /** Path after the host, version included: `/product/202309/products`. */
  readonly path: string;
  readonly accessToken: string;
  /** Required by every shop-level endpoint; omitted only for Get Authorized Shops. */
  readonly shopCipher?: string;
  readonly query?: Readonly<Record<string, string>>;
  /** JSON body, signed exactly as serialized. */
  readonly json?: unknown;
  /** Multipart body (image upload): sent as is and left out of the signature. */
  readonly form?: FormData;
}

function signedUrl(context: TikTokShopContext, request: ShopRequest<unknown>, body: string | null) {
  const { appKey, appSecret } = appCredentials(context.config);
  const query = new URLSearchParams(request.query);
  query.set("app_key", appKey);
  query.set("timestamp", String(Math.floor(context.now().getTime() / 1000)));
  if (request.shopCipher !== undefined) {
    query.set("shop_cipher", request.shopCipher);
  }
  query.set("sign", signRequest({ path: request.path, query, body, appSecret }));
  return `${API_URL}${request.path}?${query.toString()}`;
}

/** A signed call to the Open API on behalf of a shop. */
export async function requestShop<TResponse>(
  context: TikTokShopContext,
  request: ShopRequest<TResponse>,
): Promise<TResponse> {
  const body = request.json === undefined ? null : JSON.stringify(request.json);
  const headers = new Headers({ accept: "application/json" });
  headers.set("x-tts-access-token", request.accessToken);
  if (body !== null) {
    headers.set("content-type", "application/json");
  }
  const response = await fetchWithRetry(
    context.fetchImplementation,
    signedUrl(context, request, body),
    { method: request.method, headers, body: request.form ?? body },
    context.config.retry,
  );
  return readData(response, request.schema, request.method === "GET");
}

/**
 * A call to the token service (`auth.tiktok-shops.com`). The app secret travels in the query, as
 * documented, so the URL is never logged. Not retried: an authorization code works only once.
 */
export async function requestToken<TResponse>(
  context: TikTokShopContext,
  request: { schema: z.ZodType<TResponse>; path: string; query: Record<string, string> },
): Promise<TResponse> {
  const url = `${AUTH_URL}${request.path}?${new URLSearchParams(request.query).toString()}`;
  const response = await fetchWithRetry(
    context.fetchImplementation,
    url,
    { method: "GET", headers: { accept: "application/json" } },
    { ...context.config.retry, retries: 0 },
  );
  return readData(response, request.schema, false);
}
