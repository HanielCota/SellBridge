import type { FulfillmentStatus } from "../schemas/fulfillment.ts";
import { startOfBrazilDay } from "./period-range.ts";

/** Days a parcel may stay "shipped" without an estimate before the reseller is asked to confirm. */
export const CONFIRMATION_REMINDER_DAYS = 7;

const DAY_MILLISECONDS = 86_400_000;
const HOUR_MILLISECONDS = 3_600_000;

/** Still with the supplier: the dispatch deadline is what can be missed. */
const AT_SUPPLIER: ReadonlySet<FulfillmentStatus> = new Set([
  "forwarded",
  "accepted",
  "picking",
  "ready",
]);

/**
 * What is late about a parcel, if anything:
 * - `accept_overdue`: still waiting for the supplier to accept after its accept time;
 * - `dispatch_overdue`: still with the supplier after the dispatch deadline (the marketplace's,
 *   or the supplier's own dispatch time when the marketplace gave none);
 * - `delivery_overdue`: shipped and past the marketplace's delivery estimate;
 * - `awaiting_confirmation`: shipped with no estimate (stores outside Mercado Livre) for longer
 *   than `CONFIRMATION_REMINDER_DAYS`, so the reseller is asked to confirm the delivery.
 */
export type ShipmentDelay =
  "accept_overdue" | "dispatch_overdue" | "delivery_overdue" | "awaiting_confirmation";

/** How each delay reads on a badge (orders list, shipment panel). */
export const SHIPMENT_DELAY_LABELS: Record<ShipmentDelay, string> = {
  accept_overdue: "Aceite atrasado",
  dispatch_overdue: "Despacho atrasado",
  delivery_overdue: "Entrega atrasada",
  awaiting_confirmation: "Confirme a entrega",
};

export interface ShipmentTiming {
  status: FulfillmentStatus;
  dispatchDeadlineAt: Date | null;
  estimatedDeliveryAt: Date | null;
  /** When the parcel was first marked shipped; null while it has not been. */
  shippedAt: Date | null;
  /** The latest forward to the supplier: a re-forward starts the supplier's times over. */
  forwardedAt: Date | null;
  /** The supplier's own times, in hours from the forward (admin supplier form). */
  acceptWithinHours: number | null;
  dispatchWithinHours: number | null;
}

/** By when the supplier still has to act on a parcel; null once that step is behind it. */
export interface ShipmentDeadlines {
  acceptBy: Date | null;
  dispatchBy: Date | null;
}

/**
 * The instant a marketplace date is missed: the end of its day, in Brazil time. Mercado Livre
 * dates a deadline at midnight (-03:00), and the whole day is still on time.
 */
export function overdueSince(date: Date): Date {
  return new Date(startOfBrazilDay(date).getTime() + DAY_MILLISECONDS);
}

function hoursAfterForward(timing: ShipmentTiming, hours: number | null): Date | null {
  if (timing.forwardedAt === null || hours === null) {
    return null;
  }
  return new Date(timing.forwardedAt.getTime() + hours * HOUR_MILLISECONDS);
}

/** The marketplace's dispatch date when there is one, else the supplier's own dispatch time. */
function dispatchBy(timing: ShipmentTiming): Date | null {
  if (timing.dispatchDeadlineAt !== null) {
    return timing.dispatchDeadlineAt;
  }
  return hoursAfterForward(timing, timing.dispatchWithinHours);
}

/** By when the supplier must accept and dispatch, while the parcel is still with it. */
export function shipmentDeadlines(timing: ShipmentTiming): ShipmentDeadlines {
  if (!AT_SUPPLIER.has(timing.status) || timing.forwardedAt === null) {
    return { acceptBy: null, dispatchBy: null };
  }
  const acceptBy =
    timing.status === "forwarded" ? hoursAfterForward(timing, timing.acceptWithinHours) : null;
  return { acceptBy, dispatchBy: dispatchBy(timing) };
}

/**
 * The instant a parcel turns late for one delay: the marketplace's dates hold for their whole
 * day, the supplier's own times run to the hour.
 */
export function lateSinceFor(timing: ShipmentTiming, delay: ShipmentDelay): Date | null {
  if (delay === "accept_overdue") {
    return hoursAfterForward(timing, timing.acceptWithinHours);
  }
  if (delay === "dispatch_overdue") {
    return timing.dispatchDeadlineAt === null
      ? dispatchBy(timing)
      : overdueSince(timing.dispatchDeadlineAt);
  }
  if (delay === "delivery_overdue") {
    return timing.estimatedDeliveryAt === null ? null : overdueSince(timing.estimatedDeliveryAt);
  }
  if (timing.shippedAt === null) {
    return null;
  }
  return new Date(timing.shippedAt.getTime() + CONFIRMATION_REMINDER_DAYS * DAY_MILLISECONDS);
}

function hasPassed(timing: ShipmentTiming, delay: ShipmentDelay, now: Date): boolean {
  const since = lateSinceFor(timing, delay);
  return since !== null && since.getTime() <= now.getTime();
}

function supplierDelay(timing: ShipmentTiming, now: Date): ShipmentDelay | null {
  // Past the dispatch time is the later, worse step: it wins over a missing accept.
  if (hasPassed(timing, "dispatch_overdue", now)) {
    return "dispatch_overdue";
  }
  if (timing.status === "forwarded" && hasPassed(timing, "accept_overdue", now)) {
    return "accept_overdue";
  }
  return null;
}

function shippedDelay(timing: ShipmentTiming, now: Date): ShipmentDelay | null {
  if (timing.estimatedDeliveryAt !== null) {
    return hasPassed(timing, "delivery_overdue", now) ? "delivery_overdue" : null;
  }
  const since = lateSinceFor(timing, "awaiting_confirmation");
  return since !== null && since.getTime() < now.getTime() ? "awaiting_confirmation" : null;
}

/** Final statuses (delivered, cancelled, returned, not delivered) are never late. */
export function shipmentDelay(timing: ShipmentTiming, now: Date): ShipmentDelay | null {
  if (AT_SUPPLIER.has(timing.status)) {
    return supplierDelay(timing, now);
  }
  if (timing.status === "shipped") {
    return shippedDelay(timing, now);
  }
  return null;
}
