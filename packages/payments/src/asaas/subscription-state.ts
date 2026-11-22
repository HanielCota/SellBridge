import { asaasDueDate } from "./money.ts";
import type { AsaasSubscription, AsaasSubscriptionCharge } from "./subscriptions.ts";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
/** Brasília has had no daylight saving since 2019: its days start at 03:00 UTC. */
const BRASILIA_OFFSET = "-03:00";
const PAID_STATUSES = new Set(["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"]);
const DUE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * The reseller contract cut the grace to 5 days (21/11/2026). A charge due before this day keeps
 * at least the 7 days the plan page already promised when it went late.
 */
const SHORTER_GRACE_FROM_DUE_DATE = "2026-12-01";
const EARLIER_GRACE_DAYS = 7;

export type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled";

export interface SubscriptionBillingState {
  readonly status: SubscriptionStatus;
  /** Until when the plan is paid, or the end of the grace after a missed charge. */
  readonly periodEnd: Date | null;
  /** The month the last paid charge covers: from its due date to the next one. */
  readonly paidPeriod: { readonly start: Date; readonly end: Date } | null;
  /** The subscription was ended: the paid month runs out and nothing renews. */
  readonly cancelAtPeriodEnd: boolean;
  /** The oldest charge waiting for payment (late or not), for "Pagar agora". */
  readonly openCharge: AsaasSubscriptionCharge | null;
}

function dueDateParts(dueDate: string): { year: number; month: number; day: number } {
  const match = DUE_DATE.exec(dueDate);
  if (match === null) {
    throw new RangeError(`Asaas due date is not YYYY-MM-DD: ${dueDate}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * The moment a due date (Brasília calendar) begins.
 *
 * @throws {RangeError} When `dueDate` is not `YYYY-MM-DD` or not a real calendar day.
 */
export function startOfDueDate(dueDate: string): Date {
  const { year, month, day } = dueDateParts(dueDate);
  const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const start = new Date(`${text}T00:00:00${BRASILIA_OFFSET}`);
  if (Number.isNaN(start.getTime())) {
    throw new RangeError(`Asaas due date is not a calendar day: ${dueDate}`);
  }
  return start;
}

/** The same day next month, the last day of a shorter month when it has no such day. */
export function nextMonthlyDueDate(dueDate: string): string {
  const { year, month, day } = dueDateParts(dueDate);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDay);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

function newestFirst(charges: readonly AsaasSubscriptionCharge[]): AsaasSubscriptionCharge[] {
  return charges.toSorted((first, second) => second.dueDate.localeCompare(first.dueDate));
}

/**
 * Asaas holds the money: confirmed by card or received by Pix, and not being given back. A
 * refund keeps the charge "received" until it is authorized and done, so any refund that was
 * not cancelled already takes the payment away.
 */
export function isPaidCharge(charge: AsaasSubscriptionCharge): boolean {
  const givenBack = charge.refunds?.some((refund) => refund.status !== "CANCELLED") === true;
  return PAID_STATUSES.has(charge.status) && !givenBack;
}

function isOpen(charge: AsaasSubscriptionCharge): boolean {
  return (charge.status === "PENDING" || charge.status === "OVERDUE") && charge.deleted !== true;
}

function oldestOpenCharge(charges: readonly AsaasSubscriptionCharge[], after: string | null) {
  const open = charges
    .filter((charge) => isOpen(charge) && (after === null || charge.dueDate > after))
    .toSorted((first, second) => first.dueDate.localeCompare(second.dueDate));
  return open[0] ?? null;
}

/** The same day last month, the last day of a shorter month when it has no such day. */
export function previousMonthlyDueDate(dueDate: string): string {
  const { year, month, day } = dueDateParts(dueDate);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  const previousDay = Math.min(day, lastDay);
  return `${previousYear}-${String(previousMonth).padStart(2, "0")}-${String(previousDay).padStart(2, "0")}`;
}

interface PaidMonth {
  readonly paidPeriod: { readonly start: Date; readonly end: Date };
  /** The day after the next due date: the last moment the month is paid. */
  readonly paidUntil: Date;
}

function monthPaidBy(charge: AsaasSubscriptionCharge): PaidMonth {
  const end = startOfDueDate(nextMonthlyDueDate(charge.dueDate));
  return {
    paidPeriod: { start: startOfDueDate(charge.dueDate), end },
    paidUntil: new Date(end.getTime() + DAY_IN_MS),
  };
}

/** The month an earlier subscription paid, which ends where this one starts charging. */
function prepaidMonth(prepaidUntil: Date | null): PaidMonth | null {
  if (prepaidUntil === null) return null;
  const end = new Date(prepaidUntil.getTime() - DAY_IN_MS);
  const start = startOfDueDate(previousMonthlyDueDate(asaasDueDate(end, 0)));
  return { paidPeriod: { start, end }, paidUntil: prepaidUntil };
}

/** The grace a late charge gets: the configured one, or the earlier 7 days for an older charge. */
function graceDaysFor(dueDate: string, graceDays: number): number {
  if (dueDate < SHORTER_GRACE_FROM_DUE_DATE) {
    return Math.max(graceDays, EARLIER_GRACE_DAYS);
  }
  return graceDays;
}

/**
 * What a monthly subscription is worth now, read from the charges Asaas keeps: paid until the
 * day after the next due date; a late charge keeps the plan for `graceDays` from its due date.
 * Past the grace it stays `past_due` with a `periodEnd` already gone: no plan, and a payment to
 * fix. `prepaidUntil` counts a month an earlier subscription paid, until this one is paid.
 */
export function subscriptionBillingState(input: {
  subscription: AsaasSubscription;
  charges: readonly AsaasSubscriptionCharge[];
  graceDays: number;
  prepaidUntil: Date | null;
}): SubscriptionBillingState {
  const { subscription, charges, graceDays, prepaidUntil } = input;
  const ended = subscription.deleted === true || subscription.status !== "ACTIVE";
  const lastPaid = newestFirst(charges).find(isPaidCharge) ?? null;
  const openCharge = oldestOpenCharge(charges, lastPaid?.dueDate ?? null);
  const paid = lastPaid === null ? prepaidMonth(prepaidUntil) : monthPaidBy(lastPaid);
  if (paid === null) {
    const status = ended ? "canceled" : "incomplete";
    return { status, periodEnd: null, paidPeriod: null, cancelAtPeriodEnd: ended, openCharge };
  }
  const { paidPeriod, paidUntil } = paid;
  const late = openCharge?.status === "OVERDUE" ? openCharge : null;
  if (late === null || ended) {
    return {
      status: "active",
      periodEnd: paidUntil,
      paidPeriod,
      cancelAtPeriodEnd: ended,
      openCharge,
    };
  }
  const lateGraceDays = graceDaysFor(late.dueDate, graceDays);
  const graceEnd = new Date(startOfDueDate(late.dueDate).getTime() + lateGraceDays * DAY_IN_MS);
  const periodEnd = new Date(Math.max(graceEnd.getTime(), paidUntil.getTime()));
  return { status: "past_due", periodEnd, paidPeriod, cancelAtPeriodEnd: false, openCharge };
}

/** Days the first monthly fee can still be given back in full after it was paid. */
export const FIRST_FEE_REFUND_DAYS = 7;

/** The day a paid charge was paid, as Asaas records it; the due date when it says nothing. */
export function paidOn(charge: AsaasSubscriptionCharge): string {
  return charge.paymentDate ?? charge.confirmedDate ?? charge.dueDate;
}

/**
 * The account's first monthly fee, when the subscription is cancelled up to
 * `FIRST_FEE_REFUND_DAYS` days after it was paid (day 7 is in, day 8 is out): it is given back in
 * full. Later fees and upgrade differences never are. `firstPaidOn` is the day the account paid
 * its first fee ever (`YYYY-MM-DD`), so a new subscription never counts as a first one again.
 */
export function refundableFirstFee(input: {
  charges: readonly AsaasSubscriptionCharge[];
  firstPaidOn: string | null;
  today: string;
}): AsaasSubscriptionCharge | null {
  const paid = input.charges.filter(isPaidCharge);
  const [only] = paid;
  if (paid.length !== 1 || only === undefined || input.firstPaidOn === null) return null;
  if (paidOn(only) !== input.firstPaidOn) return null;
  const days =
    (startOfDueDate(input.today).getTime() - startOfDueDate(paidOn(only)).getTime()) / DAY_IN_MS;
  return days <= FIRST_FEE_REFUND_DAYS ? only : null;
}
