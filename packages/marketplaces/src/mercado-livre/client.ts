import type { AppError } from "@sellbridge/shared/errors";
import type { z } from "zod";
import { marketplaceAuthError, marketplaceError } from "../errors.ts";
import { fetchWithRetry, isIdempotentMethod, type FetchLike, type RetryOptions } from "../http.ts";
import { readMercadoLivreJson } from "./json.ts";
import { errorBodySchema } from "./schemas.ts";

export interface MercadoLivreConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  fetchImplementation?: FetchLike;
  retry?: Partial<RetryOptions>;
  now?: () => Date;
}

const API_URL = "https://api.mercadolibre.com";

/** Dependencies shared by the module-level request helpers. */
export interface MercadoLivreContext {
  readonly config: MercadoLivreConfig;
  readonly fetchImplementation: FetchLike;
  readonly now: () => Date;
}

interface JsonRequest<TResponse> {
  readonly schema: z.ZodType<TResponse>;
  readonly path: string;
  readonly init?: RequestInit & { accessToken?: string };
}

export function credentials(config: MercadoLivreConfig): {
  clientId: string;
  clientSecret: string;
} {
  if (!config.clientId || !config.clientSecret) {
    throw marketplaceError("Integração com o Mercado Livre não configurada", {
      retryable: false,
    });
  }
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

/**
 * A 5xx on a POST/PATCH (creating an item, rotating a single-use refresh token) does not say
 * whether it took effect, so it is reported as permanent instead of letting a job repeat it.
 */
async function readError(response: Response, isIdempotent: boolean): Promise<AppError> {
  const body = errorBodySchema.safeParse(await readMercadoLivreJson(response));
  const detail = body.success ? (body.data.message ?? body.data.error ?? "") : "";
  if (response.status === 401 || (body.success && body.data.error === "invalid_grant")) {
    return marketplaceAuthError();
  }
  const retryable = response.status === 429 || (isIdempotent && response.status >= 500);
  const message = detail
    ? `Mercado Livre recusou a operação: ${detail}`
    : `Mercado Livre respondeu com erro ${response.status}`;
  return marketplaceError(message, { retryable, status: response.status });
}

export async function requestJson<TResponse>(
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
    throw await readError(response, isIdempotentMethod(requestInit.method));
  }
  const parsed = request.schema.safeParse(await readMercadoLivreJson(response));
  if (!parsed.success) {
    throw marketplaceError("Resposta inesperada do Mercado Livre", { retryable: false });
  }
  return parsed.data;
}
