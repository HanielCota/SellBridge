import { recordAdminEvent } from "@sellbridge/database/repositories";
import { forbiddenError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "./database.ts";

/**
 * Server functions an admin must not run inside a customer's account, with what the refusal
 * says: they outlive the session (keys, webhooks), cut the shop off (stores), move money or
 * change who is billed. Matched by the function's name: a test checks every name still exists.
 */
export const BLOCKED_WHILE_IMPERSONATING: Readonly<Record<string, string>> = {
  createApiKeyFn: "criar chaves de API",
  revokeApiKeyFn: "revogar chaves de API",
  createWebhookEndpointFn: "criar webhooks",
  deleteWebhookEndpointFn: "excluir webhooks",
  setWebhookEndpointEnabledFn: "ligar ou desligar webhooks",
  disconnectStoreFn: "desconectar lojas",
  checkoutBilling: "assinar um plano",
  manageBilling: "mudar a assinatura",
  saveOnboardingHolder: "mudar os dados do titular",
  acceptTermsFn: "aceitar os termos de uso",
};

/** Writes too small to land in the customer's timeline (read markers). */
export const QUIET_WHILE_IMPERSONATING: ReadonlySet<string> = new Set([
  "markNotificationsSeenFn",
  "markMyTicketRead",
]);

export interface ImpersonatedCall {
  /** The admin behind the session, or null for the customer's own session. */
  impersonatedBy: string | null;
  customerId: string;
  functionName: string;
  method: string;
}

/** Throws when the call is one an admin may not make as the customer. */
export function assertAllowedWhileImpersonating(call: ImpersonatedCall): void {
  if (typeof call.impersonatedBy !== "string") {
    return;
  }
  const action = BLOCKED_WHILE_IMPERSONATING[call.functionName];
  if (action === undefined) {
    return;
  }
  throw forbiddenError(`Não é possível ${action} durante o acesso como cliente`);
}

/** Whether a call that went through is recorded in the customer's timeline under the admin. */
export function isRecordedImpersonatedCall(call: ImpersonatedCall): boolean {
  return (
    typeof call.impersonatedBy === "string" &&
    call.method === "POST" &&
    !QUIET_WHILE_IMPERSONATING.has(call.functionName)
  );
}

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
