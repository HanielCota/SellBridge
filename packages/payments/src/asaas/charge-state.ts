import type { EscrowGuarantee } from "@sellbridge/shared/escrow-release";
import type { ShipmentPaymentStatus } from "@sellbridge/shared/shipment-payments";
import { centsFromAsaasValue } from "./money.ts";
import type { AsaasPayment } from "./schemas.ts";

/** Asaas charge statuses in which the payer's money was taken and not given back. */
const MONEY_TAKEN_STATUSES = new Set([
  "CONFIRMED",
  "RECEIVED",
  "RECEIVED_IN_CASH",
  "REFUND_REQUESTED",
  "REFUND_IN_PROGRESS",
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
  "DUNNING_RECEIVED",
]);

const CHARGEBACK_STATUSES = new Set([
  "CHARGEBACK_REQUESTED",
  "CHARGEBACK_DISPUTE",
  "AWAITING_CHARGEBACK_REVERSAL",
]);

/**
 * How SellBridge keeps an Asaas status. A refund or dispute in progress still counts as paid, so
 * no second charge opens meanwhile; an unknown status stays pending, never paid.
 */
function shipmentPaymentStatus(payment: AsaasPayment): ShipmentPaymentStatus {
  if (payment.deleted === true) {
    return "cancelled";
  }
  if (payment.status === "REFUNDED") {
    return "refunded";
  }
  if (CHARGEBACK_STATUSES.has(payment.status)) {
    return "charged_back";
  }
  if (MONEY_TAKEN_STATUSES.has(payment.status)) {
    return "approved";
  }
  if (payment.status === "AWAITING_RISK_ANALYSIS") {
    return "in_process";
  }
  return "pending";
}

/** Brasília has had no daylight saving time since 2019. */
const BRASILIA_OFFSET = "-03:00";
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The guarantee's deadline. Asaas gives a calendar date (with or without a time); the start of
 * that day in Brasília is the earliest the money can leave on its own.
 *
 * @throws {RangeError} When the date is missing or not a date.
 */
function escrowExpiry(expirationDate: string | null | undefined): Date {
  const day = expirationDate?.slice(0, 10) ?? "";
  const expiresAt = new Date(`${day}T00:00:00${BRASILIA_OFFSET}`);
  if (CALENDAR_DAY.test(day) && Number.isFinite(expiresAt.getTime())) {
    return expiresAt;
  }
  throw new RangeError(`Asaas escrow expiration date is not a date: ${expirationDate}`);
}

/** An unknown guarantee status counts as ended: SellBridge never acts twice on the money. */
function escrowGuarantee(escrow: NonNullable<AsaasPayment["escrow"]>): EscrowGuarantee {
  return {
    status: escrow.status === "ACTIVE" ? "active" : "done",
    expiresAt: escrowExpiry(escrow.expirationDate),
  };
}

export interface AsaasChargeState {
  readonly paymentId: string;
  readonly status: ShipmentPaymentStatus;
  /** The payer's money was taken and not given back: a second such charge is a duplicate. */
  readonly moneyTaken: boolean;
  readonly hasChargeback: boolean;
  readonly amountCents: number;
  readonly escrowId: string | null;
  readonly escrow: EscrowGuarantee | null;
  /** Every refund Asaas lists is done (and there is at least one). */
  readonly refundDone: boolean;
  readonly paymentMethod: string | null;
}

/**
 * What a charge read back from Asaas means for SellBridge.
 *
 * @throws {RangeError} When the amount or the guarantee's deadline is not usable.
 */
export function asaasChargeState(payment: AsaasPayment): AsaasChargeState {
  const status = shipmentPaymentStatus(payment);
  const refunds = payment.refunds ?? [];
  return {
    paymentId: payment.id,
    status,
    moneyTaken: payment.deleted !== true && MONEY_TAKEN_STATUSES.has(payment.status),
    hasChargeback: CHARGEBACK_STATUSES.has(payment.status),
    amountCents: centsFromAsaasValue(payment.value),
    escrowId: payment.escrow?.id ?? null,
    escrow:
      payment.escrow === null || payment.escrow === undefined
        ? null
        : escrowGuarantee(payment.escrow),
    refundDone: refunds.length > 0 && refunds.every((refund) => refund.status === "DONE"),
    paymentMethod: payment.billingType ?? null,
  };
}

/** SellBridge's share in the charge's split, in cents (zero when it has none). */
export function platformShareCents(charge: AsaasPayment, walletId: string): number {
  const share = (charge.split ?? []).find((entry) => entry.walletId === walletId);
  return share?.fixedValue == null ? 0 : centsFromAsaasValue(share.fixedValue);
}

/** The charge asks for exactly the parcel's amount, with SellBridge's fee in its split. */
export function chargeMatchesParcel(
  charge: AsaasPayment,
  parcel: { amountCents: number; platformFeeCents: number },
  walletId: string,
): boolean {
  return (
    centsFromAsaasValue(charge.value) === parcel.amountCents &&
    platformShareCents(charge, walletId) === parcel.platformFeeCents
  );
}

/**
 * The charges, among those carrying one parcel's reference, whose money was taken: more than one
 * means the reseller paid twice and the extra one has to be given back.
 */
export function chargesWithMoneyTaken(payments: readonly AsaasPayment[]): AsaasPayment[] {
  return payments.filter(
    (payment) => payment.deleted !== true && MONEY_TAKEN_STATUSES.has(payment.status),
  );
}
