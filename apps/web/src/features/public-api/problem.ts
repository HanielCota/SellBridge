import { type AppErrorCode, isAppError } from "@sellbridge/shared/errors";
import { z } from "zod";

/** Stable, machine-readable error codes of the public API; documented in the OpenAPI spec. */
export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "conflict",
  "rate_limited",
  "idempotency_key_required",
  "idempotency_key_reused",
  "idempotency_in_progress",
  "upstream_error",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** One invalid field: where it is (`body.priceCents`, `query.page`) and what is wrong. */
export const apiIssueSchema = z.object({ path: z.string(), message: z.string() });
export type ApiIssue = z.infer<typeof apiIssueSchema>;

export const apiProblemSchema = z.object({
  status: z.number().int(),
  code: z.enum(API_ERROR_CODES),
  detail: z.string(),
  issues: z.array(apiIssueSchema).optional(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type ApiProblem = z.infer<typeof apiProblemSchema>;

const TITLES: Record<ApiErrorCode, string> = {
  unauthorized: "Chave de API ausente ou inválida",
  forbidden: "A chave não tem permissão para esta operação",
  not_found: "Recurso não encontrado",
  validation_failed: "Dados inválidos",
  conflict: "A operação conflita com o estado atual",
  rate_limited: "Limite de requisições atingido",
  idempotency_key_required: "Idempotency-Key obrigatória",
  idempotency_key_reused: "Idempotency-Key usada em outra requisição",
  idempotency_in_progress: "A requisição original ainda está em andamento",
  upstream_error: "Falha num serviço externo",
  internal_error: "Erro inesperado",
};

/** A pipeline step either produces its value or stops the request with a problem. */
export type StepResult<TValue> = { ok: true; value: TValue } | { ok: false; problem: ApiProblem };

export function proceed<TValue>(value: TValue): StepResult<TValue> {
  return { ok: true, value };
}

export function stop<TValue>(problem: ApiProblem): StepResult<TValue> {
  return { ok: false, problem };
}

const PROBLEM_BY_APP_CODE: Record<AppErrorCode, { status: number; code: ApiErrorCode }> = {
  NOT_FOUND: { status: 404, code: "not_found" },
  VALIDATION: { status: 422, code: "validation_failed" },
  UNAUTHORIZED: { status: 401, code: "unauthorized" },
  FORBIDDEN: { status: 403, code: "forbidden" },
  CONFLICT: { status: 409, code: "conflict" },
  EXTERNAL_PROVIDER: { status: 502, code: "upstream_error" },
  EXTERNAL_PROVIDER_AUTH: { status: 502, code: "upstream_error" },
  CONFIGURATION: { status: 500, code: "internal_error" },
};

/** Domain errors keep their user message; unknown errors never leak details. */
export function problemFromError(error: unknown): ApiProblem {
  if (isAppError(error)) {
    const mapped = PROBLEM_BY_APP_CODE[error.code];
    const issues = (error.details.issues ?? []).map((message) => ({ path: "", message }));
    return { ...mapped, detail: error.userMessage, ...(issues.length > 0 ? { issues } : {}) };
  }
  return { status: 500, code: "internal_error", detail: "Erro inesperado. Tente novamente." };
}

/** RFC 9457 problem details, plus our `code`, the `requestId` and field `issues`. */
export function problemResponse(
  problem: ApiProblem,
  requestId: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const body = {
    type: `https://sellbridge.dev/docs/api/errors#${problem.code}`,
    title: TITLES[problem.code],
    status: problem.status,
    code: problem.code,
    detail: problem.detail,
    requestId,
    ...(problem.issues ? { issues: problem.issues } : {}),
  };
  return new Response(JSON.stringify(body), {
    status: problem.status,
    headers: {
      ...headers,
      ...problem.headers,
      "content-type": "application/problem+json",
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}
