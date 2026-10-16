import type { FulfillmentStatus } from "../schemas/fulfillment.ts";
import { lateSinceFor, type ShipmentTiming } from "./shipment-delay.ts";

/**
 * How each parcel of a supplier counts for its health thermometer. The deadlines come from
 * `shipment-delay.ts`, so a parcel the orders list calls late is late here too: the
 * marketplace's dispatch date holds for its whole day, the supplier's own hours run to the hour.
 */

/** One parcel forwarded to the supplier, with the first time it reached each step. */
export interface ShipmentHealthRecord extends ShipmentTiming {
  shipmentId: string;
  orderId: string;
  externalOrderId: string;
  /** First accept (or a later step reached directly) after the latest forward; null if never. */
  acceptedAt: Date | null;
  /** True when the supplier itself cancelled the parcel (the link's "Não consigo enviar"). */
  cancelledBySupplier: boolean;
}

/** One reseller review of the supplier. */
export interface ReviewHealthRecord {
  orderId: string;
  externalOrderId: string;
  rating: number;
  createdAt: Date;
}

/** `pending`: the deadline is still ahead (or the step never had to happen): not counted. */
export type DeadlineOutcome = "on_time" | "late" | "pending";

/** Statuses after which the accept and the dispatch can no longer happen. */
const CLOSED_WITHOUT_DISPATCH: ReadonlySet<FulfillmentStatus> = new Set([
  "cancelled",
  "not_delivered",
]);

function decide(doneAt: Date | null, lateSince: Date | null, now: Date): DeadlineOutcome {
  if (lateSince === null) {
    return "pending";
  }
  if (doneAt !== null) {
    return doneAt.getTime() < lateSince.getTime() ? "on_time" : "late";
  }
  return now.getTime() >= lateSince.getTime() ? "late" : "pending";
}

/**
 * Whether the supplier accepted in time. A parcel cancelled before the accept does not count:
 * the reseller's cancellation is not the supplier's fault, and the supplier's own one already
 * counts once, in the cancellation rate.
 */
export function acceptOutcome(record: ShipmentHealthRecord, now: Date): DeadlineOutcome {
  if (record.acceptedAt === null && CLOSED_WITHOUT_DISPATCH.has(record.status)) {
    return "pending";
  }
  return decide(record.acceptedAt, lateSinceFor(record, "accept_overdue"), now);
}

/** Whether the parcel left before its dispatch deadline; same cancellation rule as the accept. */
export function dispatchOutcome(record: ShipmentHealthRecord, now: Date): DeadlineOutcome {
  if (record.shippedAt === null && CLOSED_WITHOUT_DISPATCH.has(record.status)) {
    return "pending";
  }
  return decide(record.shippedAt, lateSinceFor(record, "dispatch_overdue"), now);
}

/** Good and counted events of one rate metric over a set of parcels. */
export interface RateTally {
  good: number;
  counted: number;
}

function tallyOutcomes(outcomes: readonly DeadlineOutcome[]): RateTally {
  const counted = outcomes.filter((outcome) => outcome !== "pending");
  return {
    good: counted.filter((outcome) => outcome === "on_time").length,
    counted: counted.length,
  };
}

export function tallyAccept(records: readonly ShipmentHealthRecord[], now: Date): RateTally {
  return tallyOutcomes(records.map((record) => acceptOutcome(record, now)));
}

export function tallyDispatch(records: readonly ShipmentHealthRecord[], now: Date): RateTally {
  return tallyOutcomes(records.map((record) => dispatchOutcome(record, now)));
}

/** Cancellations by the supplier among every parcel forwarded; `good` is what was not cancelled. */
export function tallyCancellations(records: readonly ShipmentHealthRecord[]): RateTally {
  const cancelled = records.filter((record) => record.cancelledBySupplier).length;
  return { good: records.length - cancelled, counted: records.length };
}

/** Star sum and count of the reviews. */
export interface RatingTally {
  sum: number;
  count: number;
}

export function tallyRatings(reviews: readonly ReviewHealthRecord[]): RatingTally {
  return {
    sum: reviews.reduce((total, review) => total + review.rating, 0),
    count: reviews.length,
  };
}
