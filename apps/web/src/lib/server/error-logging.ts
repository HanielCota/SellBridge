import { createMiddleware } from "@tanstack/react-start";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { describeError } from "../error-diagnostics";

export const serverErrorLogging = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      if (isRedirect(error) || isNotFound(error)) throw error;
      logger.error("web.server_function_error", {
        buildId: import.meta.env.VITE_BUILD_ID ?? "development",
        functionName: serverFnMeta.name,
        functionId: serverFnMeta.id,
        diagnostic: describeError(error),
        code: isAppError(error) ? error.code : undefined,
        cause: error instanceof Error && error.cause ? describeError(error.cause) : undefined,
      });
      throw error;
    }
  },
);
