/**
 * When money a reseller paid into a supplier's protected (escrow) account is released to the
 * supplier, given back to the reseller, or kept waiting. The gateway holds the money; SellBridge
 * only decides when to ask for the release or the refund.
 */
import type { FulfillmentStatus } from "../schemas/fulfillment.ts";

/** Days after the confirmed delivery before the supplier gets the money (Guilherme, 15/11/2026). */
export const ESCROW_RELEASE_DELAY_IN_DAYS = 7;
/**
 * The gateway's own deadline: past it, the held money goes to the supplier on its own. It only
 * keeps a payment from being stuck forever when no delivery is ever confirmed.
 */
export const ESCROW_SAFETY_DEADLINE_IN_DAYS = 30;
/** How long before that deadline a parcel still held without a decision is shown to the team. */
export const ESCROW_ATTENTION_BEFORE_DEADLINE_IN_DAYS = 5;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Parcel outcomes that give the whole payment back to the reseller before any release. */
const REFUNDED_SHIPMENT_STATUSES = ["cancelled", "not_delivered", "returned"] as const;
type RefundedShipmentStatus = (typeof REFUNDED_SHIPMENT_STATUSES)[number];

/** The guarantee as the gateway reports it; null until the payment is received. */
export interface EscrowGuarantee {
  readonly status: "active" | "done";
  readonly expiresAt: Date;
}

export interface EscrowHoldState {
  readonly shipmentStatus: FulfillmentStatus;
  /** The first delivery confirmed by the marketplace or the reseller; never by the supplier. */
  readonly deliveredAt: Date | null;
  readonly hasOpenReturnClaim: boolean;
  /**
   * The reseller cancelled after the supplier accepted: the supplier may have posted already, so
   * the team decides instead of an automatic refund (Guilherme, 16/11/2026).
   */
  readonly cancelledByResellerAfterAccept: boolean;
  readonly hasChargeback: boolean;
  /** What the team chose on the Problemas page for a case no rule covers. */
  readonly teamDecision: "release" | "refund" | null;
  readonly escrow: EscrowGuarantee | null;
  readonly now: Date;
}

export type EscrowAction =
  | { readonly kind: "release" }
  | { readonly kind: "refund"; readonly reason: RefundedShipmentStatus | "team" }
  | {
      readonly kind: "wait";
      readonly reason: "not_delivered_yet" | "release_delay" | "escrow_not_started";
      /** When to look again; null when it depends on an event, not on time. */
      readonly until: Date | null;
    }
  | {
      readonly kind: "paused";
      readonly reason: "return_claim" | "chargeback" | "cancelled_after_accept";
    }
  | { readonly kind: "finished" };

function refundedStatus(status: FulfillmentStatus): RefundedShipmentStatus | null {
  return REFUNDED_SHIPMENT_STATUSES.find((refunded) => refunded === status) ?? null;
}

/** The day the supplier gets the money: the confirmed delivery plus the release delay. */
export function escrowReleaseDueAt(deliveredAt: Date): Date {
  return new Date(deliveredAt.getTime() + ESCROW_RELEASE_DELAY_IN_DAYS * DAY_IN_MS);
}

function teamAction(state: EscrowHoldState): EscrowAction | null {
  if (state.teamDecision === "refund") {
    return { kind: "refund", reason: "team" };
  }
  if (state.teamDecision !== "release") {
    return null;
  }
  if (state.escrow === null) {
    return { kind: "wait", reason: "escrow_not_started", until: null };
  }
  return { kind: "release" };
}

function deliveryAction(state: EscrowHoldState): EscrowAction {
  if (state.shipmentStatus !== "delivered" || state.deliveredAt === null) {
    return { kind: "wait", reason: "not_delivered_yet", until: null };
  }
  const dueAt = escrowReleaseDueAt(state.deliveredAt);
  if (state.now.getTime() < dueAt.getTime()) {
    return { kind: "wait", reason: "release_delay", until: dueAt };
  }
  // A card payment is held only once the gateway counts it as received, which can come later.
  if (state.escrow === null) {
    return { kind: "wait", reason: "escrow_not_started", until: null };
  }
  return { kind: "release" };
}

/**
 * Decides what to do with a paid parcel's held money right now.
 *
 * @remarks
 * Order matters: a guarantee the gateway already ended stays ended; a card dispute stops
 * everything; the team's choice wins over the rules; a parcel the reseller cancelled after the
 * supplier accepted pauses for the team; a cancelled, undelivered or returned parcel is refunded;
 * an open return claim pauses; otherwise the money is released once the delivery
 * is confirmed and the release delay has passed.
 */
export function escrowActionFor(state: EscrowHoldState): EscrowAction {
  if (state.escrow?.status === "done") {
    return { kind: "finished" };
  }
  if (state.hasChargeback) {
    return { kind: "paused", reason: "chargeback" };
  }
  const chosen = teamAction(state);
  if (chosen !== null) {
    return chosen;
  }
  if (state.shipmentStatus === "cancelled" && state.cancelledByResellerAfterAccept) {
    return { kind: "paused", reason: "cancelled_after_accept" };
  }
  const refunded = refundedStatus(state.shipmentStatus);
  if (refunded !== null) {
    return { kind: "refund", reason: refunded };
  }
  if (state.hasOpenReturnClaim) {
    return { kind: "paused", reason: "return_claim" };
  }
  return deliveryAction(state);
}

/**
 * Whether a guarantee still held without release or refund is close to the gateway's deadline,
 * after which the money goes to the supplier on its own: the team has to look at it.
 */
export function escrowNeedsAttention(state: EscrowHoldState): boolean {
  if (state.escrow === null || state.escrow.status === "done") {
    return false;
  }
  const action = escrowActionFor(state);
  if (action.kind === "release" || action.kind === "refund") {
    return false;
  }
  const attentionFrom =
    state.escrow.expiresAt.getTime() - ESCROW_ATTENTION_BEFORE_DEADLINE_IN_DAYS * DAY_IN_MS;
  return state.now.getTime() >= attentionFrom;
}
