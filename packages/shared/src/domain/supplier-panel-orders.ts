import { FULFILLMENT_NEXT, type FulfillmentStatus } from "../schemas/fulfillment.ts";
import { lateSinceFor, type ShipmentTiming } from "./shipment-delay.ts";

const MINUTE_MILLISECONDS = 60_000;
const HOUR_MILLISECONDS = 3_600_000;
const DAY_MILLISECONDS = 86_400_000;

/** Under this much time left the deadline reads red: the supplier has to act now. */
export const DANGER_WITHIN_MILLISECONDS = 2 * HOUR_MILLISECONDS;
/** Under this much time left the deadline reads amber: it falls within the working day. */
export const WARNING_WITHIN_MILLISECONDS = 12 * HOUR_MILLISECONDS;

/** Parcels still in the supplier's hands: the only ones with a step for it to take. */
export const SUPPLIER_QUEUE_STATUSES = ["forwarded", "accepted", "picking", "ready"] as const;
export type SupplierQueueStatus = (typeof SUPPLIER_QUEUE_STATUSES)[number];

export function isSupplierQueueStatus(status: FulfillmentStatus): status is SupplierQueueStatus {
  return SUPPLIER_QUEUE_STATUSES.some((queueStatus) => queueStatus === status);
}

/** The one button a queue row shows: the step after the parcel's current one. */
export interface SupplierNextAction {
  /** The status the shipment moves to, as `FULFILLMENT_NEXT` says. */
  status: FulfillmentStatus;
  label: string;
  /** Shipping asks for the carrier and tracking code, so it opens the shipment panel. */
  needsTracking: boolean;
}

const NEXT_ACTION_LABELS: Record<SupplierQueueStatus, string> = {
  forwarded: "Aceitar",
  accepted: "Separar",
  picking: "Marcar pronto",
  ready: "Despachar",
};

/**
 * The supplier's next step, or null once the parcel left its hands: the delivery is confirmed by
 * the store or the marketplace tracking, never by the supplier (`DELIVERY_CONFIRMED_BY`).
 */
export function nextSupplierAction(status: FulfillmentStatus): SupplierNextAction | null {
  if (!isSupplierQueueStatus(status)) {
    return null;
  }
  const next = FULFILLMENT_NEXT[status];
  if (next === null) {
    return null;
  }
  return { status: next, label: NEXT_ACTION_LABELS[status], needsTracking: next === "shipped" };
}

export type QueueUrgency = "overdue" | "danger" | "warning" | "normal";

/** Which promise the countdown is about: the accept, or the dispatch. */
export type QueueDeadlineKind = "accept" | "dispatch";

export interface QueueDeadline {
  kind: QueueDeadlineKind;
  /** The instant the parcel turns late, as `shipmentDelay` counts it. */
  at: Date;
}

type QueueTiming = Omit<ShipmentTiming, "shippedAt">;

function deadlineOf(timing: QueueTiming, kind: QueueDeadlineKind): QueueDeadline | null {
  const delay = kind === "accept" ? "accept_overdue" : "dispatch_overdue";
  const at = lateSinceFor({ ...timing, shippedAt: null }, delay);
  if (at === null) {
    return null;
  }
  return { kind, at };
}

/**
 * The next deadline the parcel can miss. A forwarded parcel has two (accept and dispatch) and the
 * earlier one counts: a marketplace dispatch date can come before the supplier's accept hours.
 * Parcels outside the queue have none.
 */
export function queueDeadline(timing: QueueTiming): QueueDeadline | null {
  if (!isSupplierQueueStatus(timing.status)) {
    return null;
  }
  const kinds: QueueDeadlineKind[] =
    timing.status === "forwarded" ? ["accept", "dispatch"] : ["dispatch"];
  const deadlines = kinds
    .map((kind) => deadlineOf(timing, kind))
    .filter((deadline) => deadline !== null);
  const [earliest] = deadlines.toSorted((left, right) => left.at.getTime() - right.at.getTime());
  return earliest ?? null;
}

/** How pressing the time left is; a parcel without a deadline is never urgent. */
export function urgencyFor(remainingMilliseconds: number | null): QueueUrgency {
  if (remainingMilliseconds === null) {
    return "normal";
  }
  if (remainingMilliseconds <= 0) {
    return "overdue";
  }
  if (remainingMilliseconds < DANGER_WITHIN_MILLISECONDS) {
    return "danger";
  }
  if (remainingMilliseconds < WARNING_WITHIN_MILLISECONDS) {
    return "warning";
  }
  return "normal";
}

/** A queue row's deadline-first reading: what to do, by when, and how pressing it is. */
export interface QueueEntry {
  action: SupplierNextAction | null;
  deadline: QueueDeadline | null;
  remainingMilliseconds: number | null;
  urgency: QueueUrgency;
}

/** Order statuses that hold the parcel back, as `isShippingBlocked` reads them on the link. */
export const BLOCKED_ORDER_STATUSES = ["pending", "cancelled", "returned"] as const;

export function isOrderBlocked(orderStatus: string): boolean {
  return BLOCKED_ORDER_STATUSES.some((status) => status === orderStatus);
}

const NOTHING_DUE: QueueEntry = {
  action: null,
  deadline: null,
  remainingMilliseconds: null,
  urgency: "normal",
};

/**
 * A sale not released for shipping (unpaid, cancelled or returned) has nothing to do and nothing
 * due: no countdown pushing the supplier to ship a parcel it must hold back.
 */
export function describeQueueEntry(
  timing: QueueTiming,
  now: Date,
  sale: { orderStatus: string } = { orderStatus: "paid" },
): QueueEntry {
  if (isOrderBlocked(sale.orderStatus)) {
    return NOTHING_DUE;
  }
  const deadline = queueDeadline(timing);
  const remainingMilliseconds = deadline === null ? null : deadline.at.getTime() - now.getTime();
  return {
    action: nextSupplierAction(timing.status),
    deadline,
    remainingMilliseconds,
    urgency: urgencyFor(remainingMilliseconds),
  };
}

/** What `compareQueueUrgency` reads from each row. */
export interface QueueOrderKey {
  id: string;
  deadline: QueueDeadline | null;
  forwardedAt: Date | null;
}

function timeOrInfinity(date: Date | null | undefined): number {
  if (date === null || date === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  return date.getTime();
}

/**
 * Most urgent first: the earliest deadline (the most overdue leads), parcels without one last,
 * then the oldest forward, then the id so the order is stable between pages.
 */
export function compareQueueUrgency(left: QueueOrderKey, right: QueueOrderKey): number {
  const byDeadline = timeOrInfinity(left.deadline?.at) - timeOrInfinity(right.deadline?.at);
  if (byDeadline !== 0 && !Number.isNaN(byDeadline)) {
    return byDeadline;
  }
  const byForward = timeOrInfinity(left.forwardedAt) - timeOrInfinity(right.forwardedAt);
  if (byForward !== 0 && !Number.isNaN(byForward)) {
    return byForward;
  }
  return left.id.localeCompare(right.id);
}

export function sortQueueByUrgency<TEntry extends QueueOrderKey>(entries: readonly TEntry[]) {
  return entries.toSorted(compareQueueUrgency);
}

function durationLabel(milliseconds: number): string {
  if (milliseconds < HOUR_MILLISECONDS) {
    return `${Math.max(1, Math.floor(milliseconds / MINUTE_MILLISECONDS))} min`;
  }
  if (milliseconds < DAY_MILLISECONDS) {
    const hours = Math.floor(milliseconds / HOUR_MILLISECONDS);
    const minutes = Math.floor((milliseconds % HOUR_MILLISECONDS) / MINUTE_MILLISECONDS);
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  }
  const days = Math.floor(milliseconds / DAY_MILLISECONDS);
  const hours = Math.floor((milliseconds % DAY_MILLISECONDS) / HOUR_MILLISECONDS);
  return hours === 0 ? `${days} d` : `${days} d ${hours} h`;
}

const DEADLINE_NOUNS: Record<QueueDeadlineKind, string> = {
  accept: "Aceite",
  dispatch: "Despacho",
};

/** The countdown badge: "Aceite em 1 h 20 min", "Despacho atrasado há 3 h". */
export function countdownLabel(entry: Pick<QueueEntry, "deadline" | "remainingMilliseconds">) {
  if (entry.deadline === null || entry.remainingMilliseconds === null) {
    return "Sem prazo";
  }
  const noun = DEADLINE_NOUNS[entry.deadline.kind];
  if (entry.remainingMilliseconds <= 0) {
    return `${noun} atrasado há ${durationLabel(-entry.remainingMilliseconds)}`;
  }
  return `${noun} em ${durationLabel(entry.remainingMilliseconds)}`;
}

/**
 * The countdown without the deadline's noun ("Atrasado há 3 h", "Em 1 h 20 min"), for a list
 * whose group title already says which deadline it is.
 */
export function shortCountdownLabel(entry: Pick<QueueEntry, "deadline" | "remainingMilliseconds">) {
  if (entry.deadline === null || entry.remainingMilliseconds === null) {
    return "Sem prazo";
  }
  if (entry.remainingMilliseconds <= 0) {
    return `Atrasado há ${durationLabel(-entry.remainingMilliseconds)}`;
  }
  return `Em ${durationLabel(entry.remainingMilliseconds)}`;
}
