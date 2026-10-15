import { type AppErrorCode, forbiddenError, isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  EXTERNAL_PROVIDER: 502,
  EXTERNAL_PROVIDER_AUTH: 502,
  CONFIGURATION: 500,
  RATE_LIMITED: 429,
};

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Runs an API route handler and turns thrown errors into JSON with a useful message. */
export async function handleApi(event: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (isAppError(error)) {
      return jsonResponse(STATUS_BY_CODE[error.code], { error: error.userMessage });
    }
    logger.error(`${event}.failed`, { error });
    return jsonResponse(500, { error: "Erro inesperado. Tente novamente." });
  }
}

/**
 * Refuses a cookie-authenticated write sent by a page of another origin (a sibling subdomain
 * posting a form with the user's cookies). Server functions get this from TanStack's CSRF
 * middleware; plain API routes that change data call it first. Browsers send `Origin` on every
 * POST and DELETE, so a missing one means a non-browser client, which carries no stolen cookie.
 */
export function assertSameOrigin(request: Request, applicationUrl: string): void {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(applicationUrl).origin) {
    throw forbiddenError("Origem da solicitação não autorizada");
  }
}
