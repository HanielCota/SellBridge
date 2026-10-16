import { recordTermsAcceptance } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { termsAcceptanceSchema } from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { tenantMiddleware } from "@/lib/server/middleware";

/**
 * Records that the signed-in person accepted the terms in force, with the date (item 26.a, L4).
 * Refused during an admin's visit (`BLOCKED_WHILE_IMPERSONATING`).
 */
export const acceptTermsFn = createServerFn({ method: "POST" })
  .middleware([tenantMiddleware])
  .validator(termsAcceptanceSchema)
  .handler(async ({ context, data }): Promise<void> => {
    await recordTermsAcceptance(database, context.userId, data.version);
    logger.info("terms.accepted", { userId: context.userId, version: data.version });
  });
