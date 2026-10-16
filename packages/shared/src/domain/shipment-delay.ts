import type { FulfillmentStatus } from "../schemas/fulfillment.ts";
import { startOfBrazilDay } from "./period-range.ts";

/** Days a parcel may stay "shipped" without an estimate before the reseller is asked to confirm. */
export const CONFIRMATION_REMINDER_DAYS = 7;

const DAY_MILLISECONDS = 86_400_000;

/** Still with the supplier: the dispatch deadline is what can be missed. */
const AT_SUPPLIER: ReadonlySet<FulfillmentStatus> = new Set([
  "forwarded",
  "accepted",
  "picking",
  "ready",
]);

/**
 * What is late about a parcel, if anything:
 * - `dispatch_overdue`: still with the supplier after the marketplace's dispatch deadline;
 * - `delivery_overdue`: shipped and past the marketplace's delivery estimate;
 * - `awaiting_confirmation`: shipped with no estimate (stores outside Mercado Livre) for longer
 *   than `CONFIRMATION_REMINDER_DAYS`, so the reseller is asked to confirm the delivery.
 */
export type ShipmentDelay = "dispatch_overdue" | "delivery_overdue" | "awaiting_confirmation";

/** How each delay reads on a badge (orders list, shipment panel). */
export const SHIPMENT_DELAY_LABELS: Record<ShipmentDelay, string> = {
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
}

/**
 * The instant a marketplace date is missed: the end of its day, in Brazil time. Mercado Livre
 * dates a deadline at midnight (-03:00), and the whole day is still on time.
 */
export function overdueSince(date: Date): Date {
  return new Date(startOfBrazilDay(date).getTime() + DAY_MILLISECONDS);
}

function isPast(date: Date | null, now: Date): boolean {
  if (date === null) {
    return false;
  }
  return overdueSince(date).getTime() <= now.getTime();
}

function shippedDelay(timing: ShipmentTiming, now: Date): ShipmentDelay | null {
  if (timing.estimatedDeliveryAt !== null) {
    return isPast(timing.estimatedDeliveryAt, now) ? "delivery_overdue" : null;
  }
  if (timing.shippedAt === null) {
    return null;
  }
  const reminderAt = timing.shippedAt.getTime() + CONFIRMATION_REMINDER_DAYS * DAY_MILLISECONDS;
  return reminderAt < now.getTime() ? "awaiting_confirmation" : null;
}

/** Final statuses (delivered, cancelled, returned, not delivered) are never late. */
export function shipmentDelay(timing: ShipmentTiming, now: Date): ShipmentDelay | null {
  if (AT_SUPPLIER.has(timing.status)) {
    return isPast(timing.dispatchDeadlineAt, now) ? "dispatch_overdue" : null;
  }
  if (timing.status === "shipped") {
    return shippedDelay(timing, now);
  }
  return null;
}
