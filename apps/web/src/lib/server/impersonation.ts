import { recordAdminEvent } from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { database } from "./database.ts";
import { isRecordedImpersonatedCall, type ImpersonatedCall } from "./impersonation-rules.ts";

export {
  assertAllowedWhileImpersonating,
  assertVisitKeepsOrdersEmail,
  BLOCKED_WHILE_IMPERSONATING,
  isRecordedImpersonatedCall,
  QUIET_WHILE_IMPERSONATING,
  type ImpersonatedCall,
} from "./impersonation-rules.ts";

/**
 * Puts the admin's name on what they did as the customer. The action already happened, so a
 * failure to write the trail is logged, not thrown.
 */
export async function recordImpersonatedCall(call: ImpersonatedCall): Promise<void> {
  if (!isRecordedImpersonatedCall(call) || typeof call.impersonatedBy !== "string") {
    return;
  }
  try {
    await recordAdminEvent(database, {
      adminId: call.impersonatedBy,
      userId: call.customerId,
      action: "acted_as_customer",
      details: { action: call.functionName },
    });
  } catch (error) {
    logger.warn("admin.audit_record_failed", { userId: call.customerId, error });
  }
}

/** "Voltar ao admin": the end of the visit goes to the timeline next to its start. */
export async function recordImpersonationEnded(session: {
  userId: string;
  impersonatedBy: string | null | undefined;
}): Promise<void> {
  if (session.impersonatedBy === null || session.impersonatedBy === undefined) {
    return;
  }
  try {
    await recordAdminEvent(database, {
      adminId: session.impersonatedBy,
      userId: session.userId,
      action: "impersonation_ended",
    });
  } catch (error) {
    logger.warn("admin.audit_record_failed", { userId: session.userId, error });
  }
}
