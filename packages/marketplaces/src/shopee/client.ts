import type { AppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import type { DownloadImage } from "../tiktok-shop/image-download.ts";
import type { z } from "zod";
import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import { fetchWithRetry, type FetchLike, type RetryOptions } from "../http.ts";
import { explainShopeeError } from "./error-messages.ts";
import { envelopeSchema, type ShopeeEnvelope } from "./schemas.ts";
import { signPublicCall, signShopCall } from "./signing.ts";

export interface ShopeeConfig {
  /** The app's numeric partner id (Open Platform Console). */
  partnerId: string | undefined;
  partnerKey: string | undefined;
  /** Sandbox V2 keys only work on the sandbox hosts, and live keys only on production. */
  sandbox?: boolean;
  webhookUrl?: string;
  downloadImage?: DownloadImage;
  fetchImplementation?: FetchLike;
  retry?: Partial<RetryOptions>;
  now?: () => Date;
}

/** Dependencies shared by the module-level request helpers. */
export interface ShopeeContext {
  readonly config: ShopeeConfig;
  readonly fetchImplementation: FetchLike;
  readonly now: () => Date;
}

interface ShopeeHosts {
  /** Open API host: "openplatform.shopee.com.br" serves developers near the US. */
  readonly api: string;
  /** Fixed seller authorization URL for the current environment. */
  readonly authorize: string;
}

/** "API calls" (API domains) and "Authorization and Authentication" (fixed authorization URL). */
const PRODUCTION_HOSTS: ShopeeHosts = {
  api: "https://openplatform.shopee.com.br",
  authorize: "https://open.shopee.com.br/auth",
};
const SANDBOX_HOSTS: ShopeeHosts = {
  api: "https://openplatform.sandbox.test-stable.shopee.sg",
  authorize: "https://open.sandbox.test-stable.shopee.com/auth",
};

export function shopeeHosts(config: ShopeeConfig): ShopeeHosts {
  return config.sandbox === true ? SANDBOX_HOSTS : PRODUCTION_HOSTS;
}

/** The partner id is an integer between 0 and 4294967295 ("API calls", common errors). */
const PARTNER_ID_PATTERN = /^\d{1,10}$/;

function isFilled(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

export function isShopeeConfigured(config: ShopeeConfig): boolean {
  return (
    isFilled(config.partnerId) &&
    PARTNER_ID_PATTERN.test(config.partnerId.trim()) &&
    isFilled(config.partnerKey)
  );
}

export function partnerCredentials(config: ShopeeConfig): {
  partnerId: string;
  partnerKey: string;
} {
  if (
    !isShopeeConfigured(config) ||
    config.partnerId === undefined ||
    config.partnerKey === undefined
  ) {
    throw marketplaceError("Integração com a Shopee não configurada", { retryable: false });
  }
  return { partnerId: config.partnerId.trim(), partnerKey: config.partnerKey.trim() };
}

function unixSeconds(context: ShopeeContext): number {
  return Math.floor(context.now().getTime() / 1000);
}

/** Longest marketplace text kept in one log entry. */
const LOGGED_TEXT_LENGTH = 500;

function forLog(text: string | undefined): string | undefined {
  return text?.replace(/\s+/g, " ").slice(0, LOGGED_TEXT_LENGTH);
}

/** Errors that mean the shop's access token is dead ("API calls", common errors). */
const TOKEN_REFUSALS: ReadonlySet<string> = new Set([
  "invalid_acceess_token",
  "invalid_access_token",
  "partner_shop_no_link",
]);
/** Refused before being processed: asking again later is safe for any method. */
const RATE_LIMIT_ERRORS: ReadonlySet<string> = new Set(["error_rate_limit", "error_limit"]);
/** Shopee-side failures that may have taken effect on a POST. */
const TRANSIENT_ERRORS: ReadonlySet<string> = new Set([
  "error_server",
  "error_inner",
  "error_network",
]);

function isTokenRefusal(envelope: ShopeeEnvelope | null): boolean {
  const error = (envelope?.error ?? "").replace(/^common\./, "");
  if (TOKEN_REFUSALS.has(error)) {
    return true;
  }
  const message = (envelope?.message ?? "").toLowerCase();
  return error === "error_auth" && /access[_ ]token|shop[_ ]?id/.test(message);
}

function isRetryableRefusal(error: string, status: number, isIdempotent: boolean): boolean {
  if (status === 429 || RATE_LIMIT_ERRORS.has(error)) {
    return true;
  }
  return isIdempotent && (status >= 500 || TRANSIENT_ERRORS.has(error));
}

function logRefusal(envelope: ShopeeEnvelope | null, status: number): void {
  logger.warn("shopee.refused", {
    status,
    error: forLog(envelope?.error),
    message: forLog(envelope?.message),
    requestId: forLog(envelope?.request_id),
  });
}

/**
 * The refusal as a typed error: a dead token asks for reconnection; a 5xx on a POST stays
 * permanent, since it may have taken effect and must not be repeated.
 */
function refusalError(
  envelope: ShopeeEnvelope | null,
  status: number,
  isIdempotent: boolean,
): AppError {
  logRefusal(envelope, status);
  if (status === 401 || isTokenRefusal(envelope)) {
    return marketplaceAuthError();
  }
  const error = envelope?.error ?? "";
  return marketplaceError(explainShopeeError(error, status), {
    retryable: isRetryableRefusal(error, status, isIdempotent),
    status,
    causes: error === "" ? [] : [error],
  });
}

interface ReadResult {
  readonly envelope: ShopeeEnvelope | null;
  readonly body: unknown;
}

async function readBody(response: Response): Promise<ReadResult> {
  const text = await response.text();
  try {
    const body: unknown = JSON.parse(text);
    const parsed = envelopeSchema.safeParse(body);
    return { envelope: parsed.success ? parsed.data : null, body };
  } catch {
    return { envelope: null, body: null };
  }
}

function isRefusal(response: Response, envelope: ShopeeEnvelope | null): boolean {
  return !response.ok || envelope === null || (envelope.error ?? "") !== "";
}

/** Where the payload is: `response` for most calls, the top level for tokens and shop info. */
type PayloadPlace = "response" | "top";

interface ReadOptions<TResponse> {
  readonly schema: z.ZodType<TResponse>;
  readonly payload: PayloadPlace;
  readonly isIdempotent: boolean;
  /** Turns a refusal into a more specific error (an expired authorization code); null keeps it. */
  readonly explainRefusal?: (envelope: ShopeeEnvelope, body: unknown) => AppError | null;
}

const UNEXPECTED_RESPONSE = "Resposta inesperada da Shopee";

/** Reads the payload of a successful response; anything else becomes a typed error. */
async function readPayload<TResponse>(
  response: Response,
  options: ReadOptions<TResponse>,
): Promise<TResponse> {
  const { envelope, body } = await readBody(response);
  if (isRefusal(response, envelope)) {
    if (response.ok && envelope === null) {
      throw marketplaceError(UNEXPECTED_RESPONSE, { retryable: false });
    }
    const specific = envelope === null ? null : (options.explainRefusal?.(envelope, body) ?? null);
    if (specific !== null) {
      logRefusal(envelope, response.status);
      throw specific;
    }
    throw refusalError(envelope, response.status, options.isIdempotent);
  }
  const candidate = options.payload === "top" ? body : Reflect.get(Object(body), "response");
  const parsed = options.schema.safeParse(candidate);
  if (!parsed.success) {
    throw marketplaceError(UNEXPECTED_RESPONSE, { retryable: false });
  }
  return parsed.data;
}

export type PublicRequest<TResponse> = Omit<ReadOptions<TResponse>, "isIdempotent"> & {
  /** API path, e.g. `/api/v2/auth/token/get`. */
  readonly path: string;
} & ({ readonly json: unknown } | { readonly form: FormData });

/**
 * A signed Public API call (the token endpoints). Not retried: an authorization code and a
 * refresh token work only once, so a repeated call could only fail or waste the new pair.
 */
export async function requestPublic<TResponse>(
  context: ShopeeContext,
  request: PublicRequest<TResponse>,
): Promise<TResponse> {
  const { partnerId, partnerKey } = partnerCredentials(context.config);
  const timestamp = unixSeconds(context);
  const query = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    sign: signPublicCall({ partnerId, path: request.path, timestamp, partnerKey }),
  });
  const headers = new Headers({ accept: "application/json" });
  if ("json" in request) {
    headers.set("content-type", "application/json");
  }

  const response = await fetchWithRetry(
    context.fetchImplementation,
    `${shopeeHosts(context.config).api}${request.path}?${query.toString()}`,
    {
      method: "POST",
      headers,
      body: "form" in request ? request.form : JSON.stringify(request.json),
    },
    { ...context.config.retry, retries: 0 },
  );
  return readPayload(response, { ...request, isIdempotent: false });
}

interface ShopCall {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly accessToken: string;
  readonly shopId: string;
  /** Request parameters of a GET call. */
  readonly query?: Readonly<Record<string, string>>;
  /** Request parameters of a POST call. */
  readonly json?: unknown;
  /** A file upload (multipart): sent instead of `json`. */
  readonly form?: FormData;
}

export type ShopRequest<TResponse> = ShopCall & Omit<ReadOptions<TResponse>, "isIdempotent">;

/**
 * A signed Shop API call. The access token travels in the query, as documented, so the URL is
 * never logged.
 */
async function callShop(
  context: ShopeeContext,
  request: ShopCall,
  accept: string,
  retry = context.config.retry,
): Promise<Response> {
  const { partnerId, partnerKey } = partnerCredentials(context.config);
  const timestamp = unixSeconds(context);
  const query = new URLSearchParams(request.query);
  query.set("partner_id", partnerId);
  query.set("timestamp", String(timestamp));
  query.set("access_token", request.accessToken);
  query.set("shop_id", request.shopId);
  query.set(
    "sign",
    signShopCall({
      partnerId,
      path: request.path,
      timestamp,
      accessToken: request.accessToken,
      shopId: request.shopId,
      partnerKey,
    }),
  );
  const json = request.json === undefined ? null : JSON.stringify(request.json);
  const headers = new Headers({ accept });
  if (json !== null && request.form === undefined) {
    headers.set("content-type", "application/json");
  }
  const body = request.form ?? json;
  return fetchWithRetry(
    context.fetchImplementation,
    `${shopeeHosts(context.config).api}${request.path}?${query.toString()}`,
    { method: request.method, headers, body },
    retry,
  );
}

export async function requestShop<TResponse>(
  context: ShopeeContext,
  request: ShopRequest<TResponse>,
): Promise<TResponse> {
  const response = await callShop(context, request, "application/json");
  return readPayload(response, { ...request, isIdempotent: request.method === "GET" });
}

/** The shipping-document API returns the PDF directly, or an API error in JSON. */
export async function requestShopPdf(
  context: ShopeeContext,
  request: ShopCall,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await callShop(context, request, "application/pdf, application/json", {
    maxBodyBytes: 10 * 1024 * 1024,
    ...context.config.retry,
  });
  const bytes = new Uint8Array(await response.clone().arrayBuffer());
  if (response.ok && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-") {
    return bytes;
  }

  const { envelope } = await readBody(response);
  if (isRefusal(response, envelope) && (!response.ok || envelope !== null)) {
    throw refusalError(envelope, response.status, true);
  }

  throw marketplaceError("A Shopee não enviou uma etiqueta em PDF.", { retryable: false });
}
