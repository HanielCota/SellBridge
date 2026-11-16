import { lateSinceFor, type ShipmentTiming } from "./shipment-delay.ts";

/**
 * Paying the supplier for a parcel through the payment provider's marketplace split: the
 * reseller pays, SellBridge keeps its fee and the rest lands in the supplier's own account.
 */

/** Mercado Pago's payment statuses that this system keeps (`authorized` maps to in_process). */
export const SHIPMENT_PAYMENT_STATUSES = [
  "pending",
  "in_process",
  "approved",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
] as const;
export type ShipmentPaymentStatus = (typeof SHIPMENT_PAYMENT_STATUSES)[number];

/**
 * Why SellBridge gives the reseller's money back on its own: the supplier did not ship in time,
 * or the parcel was cancelled or came back to the supplier.
 */
export const SHIPMENT_PAYMENT_REFUND_REASONS = ["not_dispatched", "cancelled", "returned"] as const;
export type ShipmentPaymentRefundReason = (typeof SHIPMENT_PAYMENT_REFUND_REASONS)[number];

/** The highest fee the admin may set: 30%, in basis points. */
export const MAX_PAYMENT_FEE_BASIS_POINTS = 3000;
/** The fee payments use until an admin saves one: 1%, in basis points. */
export const DEFAULT_PAYMENT_FEE_BASIS_POINTS = 100;
const BASIS_POINTS_PER_WHOLE = 10_000;

/** The fee rate a payment uses: the one the admin saved, or the default while none is saved. */
export function effectivePaymentFeeBasisPoints(savedBasisPoints: number | null): number {
  if (savedBasisPoints === null) {
    return DEFAULT_PAYMENT_FEE_BASIS_POINTS;
  }
  return savedBasisPoints;
}

export class InvalidPaymentFeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPaymentFeeError";
  }
}

/**
 * SellBridge's share of a supplier payment.
 *
 * @param amountCents - What the reseller pays, in cents. Must be a positive integer.
 * @param feeBasisPoints - The fee rate, between 0 and 3000 (30%).
 * @returns The share in cents, rounded half up, never above the amount.
 * @throws {InvalidPaymentFeeError} When the amount or the rate is out of range or not an integer.
 */
export function platformFeeCents(amountCents: number, feeBasisPoints: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new InvalidPaymentFeeError(`Payment amount must be a positive integer: ${amountCents}`);
  }
  if (
    !Number.isInteger(feeBasisPoints) ||
    feeBasisPoints < 0 ||
    feeBasisPoints > MAX_PAYMENT_FEE_BASIS_POINTS
  ) {
    throw new InvalidPaymentFeeError(`Payment fee out of range: ${feeBasisPoints}`);
  }
  return Math.round((amountCents * feeBasisPoints) / BASIS_POINTS_PER_WHOLE);
}

/**
 * Maps a provider payment status to the one kept here; unknown values (new ones the provider
 * may add) stay pending, never paid.
 */
export function shipmentPaymentStatusFrom(providerStatus: string): ShipmentPaymentStatus {
  if (providerStatus === "authorized" || providerStatus === "in_mediation") {
    return "in_process";
  }
  const known = SHIPMENT_PAYMENT_STATUSES.find((status) => status === providerStatus);
  return known ?? "pending";
}

/** What the order shows about paying the supplier, the same on both sides. */
export type SupplierPaymentBadge =
  | { kind: "paid"; paidAt: string; method: string | null }
  | { kind: "waiting" }
  /** Mercado Pago is still analysing the payment: nobody should pay again meanwhile. */
  | { kind: "reviewing" }
  /** SellBridge asked Mercado Pago to give the money back and it has not confirmed yet. */
  | { kind: "refunding" }
  /** The money went back; `refundedAt` is known when SellBridge asked for the refund. */
  | { kind: "refunded"; refundedAt: string | null }
  | { kind: "outside" };

/** What decides the badge: the payment's status and dates, as ISO strings. */
export interface SupplierPaymentBadgeInput {
  status: ShipmentPaymentStatus;
  paidAt: string | null;
  method: string | null;
  /** When SellBridge asked for the refund, or null when it did not. */
  refundRequestedAt?: string | null;
}

/**
 * The badge for a parcel: under review while Mercado Pago analyses it, paid once approved, being
 * refunded once SellBridge asked for the money back, refunded once it went back, waiting while
 * the supplier can receive here, and "outside" (paid off the system, as before) otherwise.
 */
export function supplierPaymentBadge(input: {
  payment: SupplierPaymentBadgeInput | null;
  supplierReceivesHere: boolean;
}): SupplierPaymentBadge {
  const { payment } = input;
  const refundRequestedAt = payment?.refundRequestedAt ?? null;
  if (payment?.status === "approved" && refundRequestedAt !== null) {
    return { kind: "refunding" };
  }
  if (payment?.status === "approved" && payment.paidAt !== null) {
    return { kind: "paid", paidAt: payment.paidAt, method: payment.method };
  }
  if (payment?.status === "refunded" || payment?.status === "charged_back") {
    return { kind: "refunded", refundedAt: refundRequestedAt };
  }
  if (payment?.status === "in_process") {
    return { kind: "reviewing" };
  }
  if (input.supplierReceivesHere) {
    return { kind: "waiting" };
  }
  return { kind: "outside" };
}

const HOUR_IN_MS = 3_600_000;
/** Tolerance after the dispatch deadline before SellBridge gives the money back. */
export const REFUND_GRACE_AFTER_DEADLINE_IN_HOURS = 24;
/** The supplier always has this long after being paid, even when the deadline came earlier. */
export const REFUND_MINIMUM_AFTER_PAYMENT_IN_HOURS = 48;
const DISPATCH_PENDING_STATUSES: ReadonlySet<ShipmentTiming["status"]> = new Set([
  "forwarded",
  "accepted",
  "picking",
  "ready",
]);

/**
 * When a paid parcel still with the supplier must be refunded: 24 hours after its dispatch
 * deadline (Mercado Livre's posting date, or the supplier's own dispatch time from the forward),
 * and never earlier than 48 hours after the payment. Decided by Guilherme on 2026-11-15.
 */
export function supplierPaymentRefundDueAt(timing: ShipmentTiming, paidAt: Date): Date {
  const minimum = paidAt.getTime() + REFUND_MINIMUM_AFTER_PAYMENT_IN_HOURS * HOUR_IN_MS;
  const lateSince = lateSinceFor(timing, "dispatch_overdue");
  if (lateSince === null) {
    return new Date(minimum);
  }
  const afterGrace = lateSince.getTime() + REFUND_GRACE_AFTER_DEADLINE_IN_HOURS * HOUR_IN_MS;
  return new Date(Math.max(afterGrace, minimum));
}

/**
 * Why a paid parcel's money goes back to the reseller now, or null while it stays with the
 * supplier: cancelled or back with the supplier at once, still unshipped once the refund is due.
 * A parcel the carrier failed to deliver (`not_delivered`) is never refunded here: the supplier
 * shipped it, so the team looks at it instead.
 */
export function supplierPaymentRefundReason(input: {
  timing: ShipmentTiming;
  paidAt: Date;
  now: Date;
}): ShipmentPaymentRefundReason | null {
  const { status } = input.timing;
  if (status === "cancelled") {
    return "cancelled";
  }
  if (status === "returned") {
    return "returned";
  }
  if (!DISPATCH_PENDING_STATUSES.has(status)) {
    return null;
  }
  if (input.now < supplierPaymentRefundDueAt(input.timing, input.paidAt)) {
    return null;
  }
  return "not_dispatched";
}
