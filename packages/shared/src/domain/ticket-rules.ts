import { conflictError } from "../runtime/errors.ts";

/** Mirrors the `ticket_status` enum of the database. */
export type TicketStatus = "open" | "answered" | "closed";

/** Mirrors the `ticket_category` enum: what the ticket is about, picked by the reseller. */
export const TICKET_CATEGORIES = [
  "order",
  "payment",
  "store",
  "listing",
  "account",
  "other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** Mirrors the `ticket_priority` enum, from the least to the most urgent. Set by support. */
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/**
 * How long support has to answer, counted from the reseller message that is still waiting.
 * Calendar hours: business hours are not modelled yet.
 */
export const RESPONSE_TARGET_HOURS: Record<TicketPriority, number> = {
  urgent: 2,
  high: 8,
  normal: 24,
  low: 48,
};

/** A ticket support answered and the reseller left unanswered for this long is closed. */
export const AUTO_CLOSE_AFTER_DAYS = 7;

const HOUR_MILLISECONDS = 3_600_000;

/** At most once per close: reopening the ticket clears the rating for the next close. */
export const MIN_RATING = 1;
export const MAX_RATING = 5;

/**
 * `reseller`: written by the customer. `reply`: support answer the customer reads.
 * `note`: internal support note, hidden from the customer.
 */
export type TicketMessageKind = "reseller" | "reply" | "note";

/**
 * Support must reopen a closed ticket before answering; resellers may write anytime and
 * internal notes may be added to closed tickets for the record.
 */
export function assertCanReply(status: TicketStatus, kind: TicketMessageKind): void {
  if (status === "closed" && kind === "reply") {
    throw conflictError("Reabra o chamado antes de responder");
  }
}

/**
 * A reseller message (re)opens the ticket and an internal note leaves it untouched.
 * A support reply marks it answered unless support picked another status to send with.
 */
export function nextTicketStatus(
  current: TicketStatus,
  kind: TicketMessageKind,
  requested?: TicketStatus,
): TicketStatus {
  if (kind === "note") {
    return current;
  }
  if (kind === "reseller") {
    return "open";
  }
  return requested ?? "answered";
}

/**
 * Since when the reseller has been waiting for support. The clock starts at the first
 * unanswered reseller message, keeps running through more messages and internal notes,
 * and stops on any support reply (even "forwarded to the supplier", which keeps it open).
 */
export function awaitingAfterMessage(
  current: Date | null,
  kind: TicketMessageKind,
  now: Date,
): Date | null {
  if (kind === "note") {
    return current;
  }
  if (kind === "reply") {
    return null;
  }
  return current ?? now;
}

/** Reopening puts the ticket back in the queue; answering or closing it stops the clock. */
export function awaitingAfterStatus(
  current: Date | null,
  status: TicketStatus,
  now: Date,
): Date | null {
  if (status === "open") {
    return current ?? now;
  }
  return null;
}

export function responseDueAt(awaitingSince: Date, priority: TicketPriority): Date {
  return new Date(awaitingSince.getTime() + RESPONSE_TARGET_HOURS[priority] * HOUR_MILLISECONDS);
}

export type ResponseTiming =
  | { state: "none" }
  | { state: "on_time"; dueAt: Date; remainingMilliseconds: number }
  | { state: "overdue"; dueAt: Date; lateMilliseconds: number };

/** Whether support still owes an answer, and how much time is left (or how late it is). */
export function responseTiming(
  awaitingSince: Date | null,
  priority: TicketPriority,
  now: Date,
): ResponseTiming {
  if (!awaitingSince) {
    return { state: "none" };
  }
  const dueAt = responseDueAt(awaitingSince, priority);
  const remaining = dueAt.getTime() - now.getTime();
  if (remaining < 0) {
    return { state: "overdue", dueAt, lateMilliseconds: -remaining };
  }
  return { state: "on_time", dueAt, remainingMilliseconds: remaining };
}

export function assertCustomerCanClose(status: TicketStatus): void {
  if (status === "closed") {
    throw conflictError("Este chamado já está encerrado");
  }
}

export function assertCanRate(status: TicketStatus, ratedAt: Date | null): void {
  if (status !== "closed") {
    throw conflictError("Avalie o atendimento depois que o chamado for encerrado");
  }
  if (ratedAt) {
    throw conflictError("Você já avaliou este atendimento");
  }
}
