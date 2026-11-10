import { logger } from "@sellbridge/shared/logger";
import type { z } from "zod";
import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import { fetchWithRetry, type FetchLike, type RetryOptions } from "../http.ts";
import { blingErrorResponseSchema } from "./schemas.ts";

export const BLING_API_BASE_URL = "https://api.bling.com.br/Api/v3";

/**
 * Bling returns JWTs only to clients that ask with this header, on the token calls and on every
 * API call; opaque tokens are deprecated (developer.bling.com.br/migracao-jwt).
 */
export const BLING_JWT_HEADERS = { "enable-jwt": "1" } as const;

export interface BlingHttpOptions {
  readonly fetchImplementation: FetchLike;
  readonly retry?: Partial<RetryOptions>;
}

const RECONNECT_MESSAGE = "A conta do Bling precisa ser conectada de novo";

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw marketplaceError("O Bling respondeu num formato inesperado", {
      retryable: false,
      status: response.status,
      cause: error,
    });
  }
}

function blingFailure(response: Response, body: unknown): Error {
  const parsed = blingErrorResponseSchema.safeParse(body);
  const type = parsed.success ? parsed.data.error.type : null;
  if (response.status === 401) {
    return marketplaceAuthError(RECONNECT_MESSAGE);
  }
  if (response.status === 403) {
    return marketplaceError("O aplicativo do Bling não tem permissão para esta ação", {
      retryable: false,
      status: 403,
      causes: type === null ? [] : [type],
    });
  }
  const retryable = response.status === 429 || response.status >= 500;
  return marketplaceError(`O Bling recusou o pedido (HTTP ${response.status})`, {
    retryable,
    status: response.status,
    causes: type === null ? [] : [type],
  });
}

/**
 * One Bling call: retries timeouts and 429/5xx (GET) or only 429 (POST), turns failures into
 * marketplace errors (401 → reconnect) and validates the answer with `schema`.
 */
export async function blingRequest<Result>(
  options: BlingHttpOptions,
  request: { url: string; init: RequestInit; schema: z.ZodType<Result> },
): Promise<Result> {
  const response = await fetchWithRetry(
    options.fetchImplementation,
    request.url,
    request.init,
    options.retry,
  );
  const body = await readJson(response);
  if (!response.ok) {
    throw blingFailure(response, body);
  }
  const parsed = request.schema.safeParse(body);
  if (!parsed.success) {
    logger.warn("bling.unexpected_response", {
      path: new URL(request.url).pathname,
      issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
    });
    throw marketplaceError("O Bling respondeu num formato inesperado", {
      retryable: false,
      status: response.status,
    });
  }
  return parsed.data;
}
