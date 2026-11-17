import { logger } from "@sellbridge/shared/logger";
import { parseJsonText, readBodyWithin } from "@sellbridge/shared/http-body";
import type { z } from "zod";
import { asaasErrorResponseSchema } from "./schemas.ts";

/**
 * Asaas's API, from its official docs (docs.asaas.com, read 15/11/2026):
 * keys and base URLs https://docs.asaas.com/docs/chaves-de-api
 * subaccounts https://docs.asaas.com/reference/criar-subconta
 * escrow https://docs.asaas.com/docs/introducao-conta-escrow
 * split https://docs.asaas.com/docs/split-de-pagamentos
 * charges https://docs.asaas.com/reference/criar-nova-cobranca
 * refunds https://docs.asaas.com/reference/estornar-cobranca
 * webhooks https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook
 */
export const ASAAS_SANDBOX_API_URL = "https://api-sandbox.asaas.com/v3";
export const ASAAS_PRODUCTION_API_URL = "https://api.asaas.com/v3";

const REQUEST_TIMEOUT_IN_MS = 15_000;
/** Asaas answers in a few kilobytes; a larger body is refused before it fills memory. */
const MAX_BODY_BYTES = 1024 * 1024;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AsaasHttpOptions {
  readonly fetchImplementation: FetchLike;
  /** `ASAAS_SANDBOX_API_URL`, `ASAAS_PRODUCTION_API_URL` or a local stand-in in tests. */
  readonly baseUrl: string;
}

export class AsaasError extends Error {
  /** The HTTP status, or null when Asaas could not be reached or answered something unreadable. */
  readonly status: number | null;
  /** Asaas's own codes for the refusal (`errors[].code`). */
  readonly codes: readonly string[];
  /** Asaas's own words for the refusal (`errors[].description`), safe to show to the team. */
  readonly issues: readonly string[];

  constructor(
    message: string,
    details: { status: number | null; codes?: readonly string[]; issues?: readonly string[] },
  ) {
    super(message);
    this.name = "AsaasError";
    this.status = details.status;
    this.codes = details.codes ?? [];
    this.issues = details.issues ?? [];
  }

  /** Asaas refused the key itself: the account's access must be set up again. */
  get refusedCredentials(): boolean {
    return this.status === 401;
  }

  /**
   * A write that timed out or got a server error may still have gone through: the caller must
   * read the state back before trying again, never repeat it blindly.
   */
  get outcomeUnknown(): boolean {
    return this.status === null || this.status >= 500;
  }
}

export function isAsaasError(error: unknown): error is AsaasError {
  return error instanceof AsaasError;
}

export interface AsaasRequest<Result> {
  readonly path: string;
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly schema: z.ZodType<Result>;
}

function refusal(path: string, status: number, body: unknown): AsaasError {
  const parsed = asaasErrorResponseSchema.safeParse(body);
  const errors = parsed.success ? parsed.data.errors : [];
  return new AsaasError(`Asaas answered ${status} on ${path}`, {
    status,
    codes: errors.flatMap((entry) => (entry.code === undefined ? [] : [entry.code])),
    issues: errors.flatMap((entry) =>
      entry.description === undefined || entry.description.trim() === "" ? [] : [entry.description],
    ),
  });
}

async function send(
  options: AsaasHttpOptions,
  request: AsaasRequest<unknown> & { readonly apiKey: string },
  path: string,
): Promise<Response> {
  try {
    return await options.fetchImplementation(`${options.baseUrl}${request.path}`, {
      method: request.method ?? "GET",
      headers: {
        access_token: request.apiKey,
        accept: "application/json",
        "user-agent": "SellBridge",
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_IN_MS),
    });
  } catch (error) {
    throw new AsaasError(`Asaas unreachable on ${path}: ${String(error)}`, {
      status: null,
    });
  }
}

/**
 * One Asaas call with the given key, sent once (a timed-out write may have gone through, so it
 * is never repeated here), with the answer checked against `schema`.
 */
export async function asaasRequest<Result>(
  options: AsaasHttpOptions,
  request: AsaasRequest<Result> & { readonly apiKey: string },
): Promise<Result> {
  const path = new URL(`${options.baseUrl}${request.path}`).pathname;
  // The query string carries reseller and parcel ids, which stay out of errors and logs.
  const response = await send(options, request, path);
  const bytes = await readBodyWithin(response, MAX_BODY_BYTES);
  if (bytes === null) {
    throw new AsaasError(`Asaas answer on ${path} is larger than ${MAX_BODY_BYTES} bytes`, {
      status: null,
    });
  }
  const body = parseJsonText(new TextDecoder().decode(bytes));
  if (!response.ok) {
    throw refusal(path, response.status, body);
  }
  const parsed = request.schema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  logger.warn("asaas.unexpected_response", {
    path,
    issues: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join(".")),
  });
  throw new AsaasError(`Unexpected Asaas answer on ${path}`, { status: null });
}
