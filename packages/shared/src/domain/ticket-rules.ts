import { conflictError } from "../runtime/errors.ts";

/** Mirrors the `ticket_status` enum of the database. */
export type TicketStatus = "open" | "answered" | "closed";

/** Support must reopen a closed ticket before answering; resellers may write anytime. */
export function assertCanReply(status: TicketStatus, isAdmin: boolean): void {
  if (status === "closed" && isAdmin) {
    throw conflictError("Reabra o chamado antes de responder");
  }
}

/** A support reply marks the ticket answered; a reseller message (re)opens it. */
export function nextTicketStatus(isAdmin: boolean): TicketStatus {
  if (isAdmin) {
    return "answered";
  }
  return "open";
}
