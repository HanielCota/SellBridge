import { readTextWithin } from "@sellbridge/shared/http-body";
import type { ApiScope } from "@sellbridge/shared/public-api";
import type { z } from "zod";
import { type ApiCaller, authenticateApiKey, requireScope } from "./authenticate.server";
import { type ApiIssue, proceed, stop, type StepResult } from "./problem";
import { enforceRateLimit, type RateLimitHeaders } from "./rate-limit.server";

/** What every response of one request shares. */
export interface RequestState {
  requestId: string;
  now: Date;
  path: string;
  rateLimitHeaders: RateLimitHeaders;
}

function issuesOf(error: z.ZodError, prefix: string): ApiIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].join("."),
    message: issue.message,
  }));
}

export function parsePart<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  prefix: string,
): StepResult<z.output<TSchema>> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return proceed(parsed.data);
  }
  return stop({
    status: 400,
    code: "validation_failed",
    detail: "Alguns campos estão inválidos; veja `issues`.",
    issues: issuesOf(parsed.error, prefix),
  });
}

/** Every request body of the API is a small JSON object; anything bigger is a mistake. */
export const MAX_BODY_BYTES = 64 * 1024;

function bodyTooLarge<TValue>(): StepResult<TValue> {
  return stop({
    status: 413,
    code: "payload_too_large",
    detail: `O corpo da requisição pode ter até ${MAX_BODY_BYTES / 1024} KB.`,
  });
}

/** Refuses oversized bodies by their declared length, then by the bytes actually streamed. */
export async function readBody(request: Request): Promise<StepResult<string>> {
  const text = await readTextWithin(request, MAX_BODY_BYTES);
  if (text === null) {
    return bodyTooLarge();
  }
  return proceed(text);
}

export function parseJson(text: string): StepResult<unknown> {
  if (text.trim() === "") {
    return proceed({});
  }
  try {
    return proceed(JSON.parse(text));
  } catch {
    return stop({
      status: 400,
      code: "validation_failed",
      detail: "O corpo não é um JSON válido.",
    });
  }
}

export function jsonResponse(state: RequestState, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...state.rateLimitHeaders,
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-request-id": state.requestId,
    },
  });
}

/** Authenticated, authorized and within the rate limit, or the problem that stops it. */
export async function admitCaller(
  request: Request,
  scope: ApiScope | null,
  now: Date,
): Promise<StepResult<{ caller: ApiCaller; rateLimitHeaders: RateLimitHeaders }>> {
  const authenticated = await authenticateApiKey(request.headers, now);
  if (!authenticated.ok) {
    return authenticated;
  }
  const authorized = requireScope(authenticated.value, scope);
  if (!authorized.ok) {
    return authorized;
  }
  const limited = await enforceRateLimit(authorized.value.apiKeyId, now);
  if (!limited.ok) {
    return limited;
  }
  return proceed({ caller: authorized.value, rateLimitHeaders: limited.value });
}
