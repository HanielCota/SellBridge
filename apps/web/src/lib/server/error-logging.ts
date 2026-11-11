import { createMiddleware } from "@tanstack/react-start";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { type AppErrorCode, isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { describeError } from "../error-diagnostics";

/**
 * Answers to what the caller sent or may do, not server failures: they stay a warning, so a
 * customer cannot fill or mute the team's error alerts by repeating a refused request.
 */
const CALLER_ERROR_CODES: ReadonlySet<AppErrorCode> = new Set([
  "NOT_FOUND",
  "VALIDATION",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONFLICT",
  "RATE_LIMITED",
]);

export const serverErrorLogging = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      if (isRedirect(error) || isNotFound(error)) throw error;
      const code = isAppError(error) ? error.code : undefined;
      const fields = {
        buildId: import.meta.env.VITE_BUILD_ID ?? "development",
        functionName: serverFnMeta.name,
        functionId: serverFnMeta.id,
        diagnostic: describeError(error),
        code,
        cause: error instanceof Error && error.cause ? describeError(error.cause) : undefined,
      };
      if (code !== undefined && CALLER_ERROR_CODES.has(code)) {
        logger.warn("web.server_function_refused", fields);
        throw error;
      }
      logger.error("web.server_function_error", fields);
      throw error;
    }
  },
);
