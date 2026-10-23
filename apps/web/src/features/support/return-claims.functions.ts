import { decideReturnClaim } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { decideReturnClaimSchema } from "@sellbridge/shared/return-claims";
import { createServerFn } from "@tanstack/react-start";
import { database } from "@/lib/server/database";
import { staffMiddleware } from "@/lib/server/middleware";

/**
 * Credit the reseller for a returned order, or not. Money, so supervisors and admins only.
 * The credit is recorded on the claim; paying it out is not part of the product yet.
 */
export const staffDecideReturnClaim = createServerFn({ method: "POST" })
  .middleware([staffMiddleware("support.credit_returns")])
  .validator(decideReturnClaimSchema)
  .handler(async ({ context, data }) => {
    const result = await decideReturnClaim(database, { decision: data, actorId: context.userId });
    logger.info("return_claims.decided", {
      claimId: data.claimId,
      ticketId: result.ticketId,
      status: result.status,
      staffId: context.userId,
    });
    return { status: result.status };
  });
