import { recordAdminEvent } from "@sellbridge/database/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
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

/** What the team reads when the trail cannot be written: nothing was done in the account. */
export const AUDIT_UNAVAILABLE_MESSAGE =
  "Não deu para registrar o que a equipe faz na conta do cliente, então nada foi feito. Tente de novo em alguns minutos.";

/** What the team reads when "Entrar como cliente" cannot be recorded: the visit did not open. */
export const VISIT_NOT_RECORDED_MESSAGE =
  "Não deu para registrar a sua entrada na conta do cliente, então ela não foi aberta. Tente de novo em alguns minutos.";

/** The event of a trail that could not be written: an error, so the team is alerted. */
export const AUDIT_RECORD_FAILED_EVENT = "admin.audit_record_failed";

/**
 * Puts the admin's name on what they are about to do as the customer, before it runs: when the
 * trail cannot be written, the action is refused, so nothing the team does goes unrecorded.
 *
 * @throws {AppError} FORBIDDEN with {@link AUDIT_UNAVAILABLE_MESSAGE} when the trail fails.
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
    logger.error(AUDIT_RECORD_FAILED_EVENT, {
      reason: "Uma ação da equipe na conta do cliente foi recusada porque o registro falhou.",
      userId: call.customerId,
      action: call.functionName,
      error,
    });
    throw forbiddenError(AUDIT_UNAVAILABLE_MESSAGE);
  }
}

/**
 * "Voltar ao admin": the end of the visit goes to the timeline next to its start. Leaving is never
 * refused (that would keep the team inside the account); a failed trail alerts the team.
 */
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
    logger.error(AUDIT_RECORD_FAILED_EVENT, {
      reason: "A saída da equipe da conta do cliente não ficou registrada.",
      userId: session.userId,
      error,
    });
  }
}
