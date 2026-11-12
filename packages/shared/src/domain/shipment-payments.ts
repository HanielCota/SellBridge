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
  | { kind: "refunded" }
  | { kind: "outside" };

/**
 * The badge for a parcel: paid once approved, refunded once the money went back, waiting while
 * the supplier can receive here, and "outside" (paid off the system, as before) otherwise.
 */
export function supplierPaymentBadge(input: {
  payment: { status: ShipmentPaymentStatus; paidAt: string | null; method: string | null } | null;
  supplierReceivesHere: boolean;
}): SupplierPaymentBadge {
  const { payment } = input;
  if (payment?.status === "approved" && payment.paidAt !== null) {
    return { kind: "paid", paidAt: payment.paidAt, method: payment.method };
  }
  if (payment?.status === "refunded" || payment?.status === "charged_back") {
    return { kind: "refunded" };
  }
  if (input.supplierReceivesHere) {
    return { kind: "waiting" };
  }
  return { kind: "outside" };
}
