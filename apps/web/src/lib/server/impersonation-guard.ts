import type { ImpersonationTarget } from "@sellbridge/database/repositories";
import {
  IMPERSONATION_REFUSAL_MESSAGES,
  impersonationRefusal,
  type ImpersonationParty,
} from "@sellbridge/shared/impersonation-access";
import { logger } from "@sellbridge/shared/logger";
import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { ticketCode } from "@sellbridge/shared/ticket-rules";
import { APIError } from "better-auth/api";
import { z } from "zod";

/** How the guard reads the accounts involved; the auth hook backs it with the database. */
export interface ImpersonationDirectory {
  findAccount(userId: string): Promise<ImpersonationParty | null>;
  findTarget(userId: string): Promise<ImpersonationTarget>;
}

/** The plugin coerces `userId` to a string; the guard reads it the same way. */
const impersonateBodySchema = z.object({ userId: z.coerce.string().min(1) });

/**
 * Runs before `/admin/impersonate-user`, over HTTP or `auth.api`: the plugin only checks the
 * role's `impersonate` power, this adds who may be entered (see `impersonation-access`). It
 * refuses on its own what it cannot read, instead of trusting the plugin to do it.
 */
export async function assertMayImpersonate(
  call: { actor: ImpersonationParty | null; body: unknown },
  directory: ImpersonationDirectory,
): Promise<void> {
  if (call.actor === null) {
    throw new APIError("UNAUTHORIZED", { message: "Entre na sua conta da equipe." });
  }
  const parsed = impersonateBodySchema.safeParse(call.body);
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", { message: "Informe a conta do cliente." });
  }
  const target = await directory.findAccount(parsed.data.userId);
  if (target === null) {
    throw new APIError("NOT_FOUND", { message: "Conta do cliente não encontrada." });
  }
  const { openTicketId } = await directory.findTarget(target.id);
  const refusal = impersonationRefusal({
    actor: call.actor,
    target,
    targetHasOpenTicket: openTicketId !== null,
  });
  if (refusal === null) {
    return;
  }
  logger.warn("support.impersonation_refused", {
    actorId: call.actor.id,
    targetId: target.id,
    reason: refusal,
  });
  throw new APIError("FORBIDDEN", { message: IMPERSONATION_REFUSAL_MESSAGES[refusal] });
}

/**
 * What the customer's timeline records about a visit: who was entered and, for an agent or a
 * supervisor, the ticket that let them in. An admin's visit needs no ticket, so none is named.
 */
export function visitDetails(input: {
  impersonatorRole: string | null;
  target: ImpersonationTarget;
}): { profileKind: ProfileKind | null; ticketCode: string | null } {
  const { openTicketId, profileKind } = input.target;
  const isAdmin = hasStaffPermission(input.impersonatorRole, "customers.manage");
  if (isAdmin || openTicketId === null) {
    return { profileKind, ticketCode: null };
  }
  return { profileKind, ticketCode: ticketCode(openTicketId) };
}
