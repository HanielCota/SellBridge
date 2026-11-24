import { escrowReleaseDueAt } from "./escrow-release.ts";
import type { ShipmentPaymentStatus, SupplierPayMethod } from "./shipment-payments.ts";
import { asaasFeeEstimateCents } from "./supplier-net-amount.ts";

/**
 * The supplier's statement: for each parcel the reseller paid through SellBridge, the products'
 * price, SellBridge's share, the Asaas fee, what is left for the supplier and where the money is.
 * Shipping never enters: the reseller pays the supplier only the products.
 */

/** Where a paid parcel's money is, with the day that matters to the supplier when there is one. */
export type StatementSituation =
  | { kind: "waiting_delivery" }
  | { kind: "releases_on"; on: Date }
  | { kind: "released"; on: Date | null }
  | { kind: "team_review" }
  | { kind: "returning" }
  | { kind: "returned"; on: Date | null }
  | { kind: "card_dispute" };

/**
 * Which total a line adds to: money that stays with the supplier (released or still held), money
 * the team is looking at, or money going back to the reseller.
 */
export type StatementBucket = "released" | "held" | "returned";

/** One paid parcel's payment, as the statement reads it. */
export interface StatementPayment {
  provider: string;
  status: ShipmentPaymentStatus;
  amountCents: number;
  platformFeeCents: number;
  /** The fee the provider really took, once recorded; null for older payments. */
  providerFeeCents: number | null;
  paymentMethod: string | null;
  paidAt: Date;
  refundRequestedAt: Date | null;
  refundFailedAt: Date | null;
  refundHeldAt: Date | null;
  releasedAt: Date | null;
  escrowStatus: "active" | "done" | null;
  teamDecision: "release" | "refund" | null;
  teamDecisionAt: Date | null;
  /** The parcel's first confirmed delivery. */
  deliveredAt: Date | null;
}

/** One line of the statement, every amount in cents. */
export interface StatementLine {
  situation: StatementSituation;
  bucket: StatementBucket;
  /** The products' price the reseller paid, without shipping. */
  soldCents: number;
  /** SellBridge's share; zero once the money goes back, since the split goes back with it. */
  platformFeeCents: number;
  /** The Asaas fee, or null when there is none to show (money going back, another provider). */
  asaasFeeCents: number | null;
  /** True when the Asaas fee is Asaas's standard price, not the one it really took. */
  asaasFeeEstimated: boolean;
  /** What the supplier keeps; zero when the money goes back. */
  netCents: number;
}

/** Totals of a period, every amount in cents; only money that stays counts in the first four. */
export interface StatementTotals {
  soldCents: number;
  platformFeeCents: number;
  asaasFeeCents: number;
  netCents: number;
  releasedNetCents: number;
  heldNetCents: number;
  /** True when any Asaas fee in the totals is an estimate. */
  asaasFeeEstimated: boolean;
  orders: number;
  returnedOrders: number;
  /** What went or is going back to the reseller, the products' price. */
  returnedCents: number;
}

const CARD_METHODS: ReadonlySet<string> = new Set(["CREDIT_CARD", "credit_card"]);

function payMethodOf(paymentMethod: string | null): SupplierPayMethod {
  if (paymentMethod !== null && CARD_METHODS.has(paymentMethod)) {
    return "CREDIT_CARD";
  }
  return "PIX";
}

function moneyGoingBack(payment: StatementPayment): StatementSituation | null {
  if (payment.status === "refunded") {
    return { kind: "returned", on: payment.refundRequestedAt ?? payment.teamDecisionAt };
  }
  if (payment.status === "charged_back") {
    return { kind: "card_dispute" };
  }
  const refundStarted = payment.refundRequestedAt !== null || payment.refundFailedAt !== null;
  if (refundStarted || payment.teamDecision === "refund") {
    return { kind: "returning" };
  }
  return null;
}

function moneyReleased(payment: StatementPayment): StatementSituation | null {
  if (payment.releasedAt !== null) {
    return { kind: "released", on: payment.releasedAt };
  }
  if (payment.teamDecision === "release") {
    return { kind: "released", on: payment.teamDecisionAt };
  }
  if (payment.escrowStatus === "done") {
    return { kind: "released", on: null };
  }
  // Only Asaas holds the money; any other provider paid the supplier at once.
  if (payment.provider !== "asaas") {
    return { kind: "released", on: payment.paidAt };
  }
  return null;
}

/** Where a paid parcel's money is now. */
export function statementSituationOf(payment: StatementPayment): StatementSituation {
  const goingBack = moneyGoingBack(payment);
  if (goingBack !== null) {
    return goingBack;
  }
  const released = moneyReleased(payment);
  if (released !== null) {
    return released;
  }
  if (payment.refundHeldAt !== null) {
    return { kind: "team_review" };
  }
  if (payment.deliveredAt === null) {
    return { kind: "waiting_delivery" };
  }
  return { kind: "releases_on", on: escrowReleaseDueAt(payment.deliveredAt) };
}

function bucketOf(situation: StatementSituation): StatementBucket {
  if (situation.kind === "released") {
    return "released";
  }
  const goingBack =
    situation.kind === "returned" ||
    situation.kind === "returning" ||
    situation.kind === "card_dispute";
  if (goingBack) {
    return "returned";
  }
  return "held";
}

function asaasFeeOf(payment: StatementPayment): { cents: number | null; estimated: boolean } {
  if (payment.providerFeeCents !== null) {
    return { cents: payment.providerFeeCents, estimated: false };
  }
  if (payment.provider !== "asaas") {
    return { cents: null, estimated: false };
  }
  return {
    cents: asaasFeeEstimateCents(payment.amountCents, payMethodOf(payment.paymentMethod)),
    estimated: true,
  };
}

/** The statement line of one paid parcel. */
export function statementLineOf(payment: StatementPayment): StatementLine {
  const situation = statementSituationOf(payment);
  const bucket = bucketOf(situation);
  if (bucket === "returned") {
    return {
      situation,
      bucket,
      soldCents: payment.amountCents,
      platformFeeCents: 0,
      asaasFeeCents: null,
      asaasFeeEstimated: false,
      netCents: 0,
    };
  }
  const fee = asaasFeeOf(payment);
  const net = payment.amountCents - payment.platformFeeCents - (fee.cents ?? 0);
  return {
    situation,
    bucket,
    soldCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
    asaasFeeCents: fee.cents,
    asaasFeeEstimated: fee.estimated,
    netCents: Math.max(net, 0),
  };
}

const EMPTY_TOTALS: StatementTotals = {
  soldCents: 0,
  platformFeeCents: 0,
  asaasFeeCents: 0,
  netCents: 0,
  releasedNetCents: 0,
  heldNetCents: 0,
  asaasFeeEstimated: false,
  orders: 0,
  returnedOrders: 0,
  returnedCents: 0,
};

/** Adds up a period's lines: what was sold and kept, what was released or held, what went back. */
export function statementTotalsOf(lines: readonly StatementLine[]): StatementTotals {
  const totals = { ...EMPTY_TOTALS };
  for (const line of lines) {
    if (line.bucket === "returned") {
      totals.returnedOrders += 1;
      totals.returnedCents += line.soldCents;
      continue;
    }
    totals.orders += 1;
    totals.soldCents += line.soldCents;
    totals.platformFeeCents += line.platformFeeCents;
    totals.asaasFeeCents += line.asaasFeeCents ?? 0;
    totals.asaasFeeEstimated ||= line.asaasFeeEstimated;
    totals.netCents += line.netCents;
    if (line.bucket === "released") {
      totals.releasedNetCents += line.netCents;
      continue;
    }
    totals.heldNetCents += line.netCents;
  }
  return totals;
}
