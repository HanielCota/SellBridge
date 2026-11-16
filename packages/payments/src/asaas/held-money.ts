import {
  claimEscrowRelease,
  markEscrowReleased,
  markShipmentPaymentRefundFailed,
  requestShipmentPaymentRefund,
  type HeldPayment,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import {
  escrowActionFor,
  escrowNeedsAttention,
  type EscrowAction,
  type EscrowHoldState,
} from "@sellbridge/shared/escrow-release";
import { logger } from "@sellbridge/shared/logger";
import { formatCents } from "@sellbridge/shared/money";
import type { ShipmentPaymentRefundReason } from "@sellbridge/shared/shipment-payments";
import { withAsaasAccount } from "./account-access.ts";
import type { AsaasContext } from "./context.ts";
import { isAsaasError } from "./http.ts";

/**
 * A release or refund that may not have reached Asaas (timeout, server error) is asked again only
 * after this long, once Asaas still shows the money held: never twice in a row.
 */
export const RETRY_UNCONFIRMED_AFTER_IN_MS = 60 * 60 * 1000;

export type HeldMoneyOutcome =
  | { kind: "released" }
  | { kind: "refund_requested"; reason: ShipmentPaymentRefundReason }
  | { kind: "refund_refused" }
  | { kind: "kept"; action: EscrowAction["kind"] };

function holdState(held: HeldPayment, now: Date): EscrowHoldState {
  const { payment } = held;
  return {
    shipmentStatus: held.shipmentStatus,
    deliveredAt: held.deliveredAt,
    hasOpenReturnClaim: held.hasOpenReturnClaim,
    cancelledByResellerAfterAccept: held.cancelledByResellerAfterAccept,
    hasChargeback: payment.status === "charged_back",
    teamDecision: payment.teamDecision,
    escrow:
      payment.escrowStatus === null || payment.escrowExpiresAt === null
        ? null
        : { status: payment.escrowStatus, expiresAt: payment.escrowExpiresAt },
    now,
  };
}

/** Logged for the team's Problemas page, with buttons to release or refund the money by hand. */
function reportNeedsDecision(held: HeldPayment, why: string): void {
  logger.error("asaas.held_payment_needs_decision", {
    reason: `Pagamento protegido de ${formatCents(held.payment.amountCents)} precisa de uma decisão: ${why}`,
    problemKey: held.payment.id,
    shipmentPaymentId: held.payment.id,
    shipmentId: held.payment.shipmentId,
    supplierId: held.payment.supplierId,
    tenantId: held.tenantId,
    orderId: held.orderId,
  });
}

async function release(
  context: AsaasContext,
  input: { account: SupplierPaymentAccount; payment: ShipmentPayment; now: Date },
): Promise<HeldMoneyOutcome> {
  const { payment } = input;
  const claimed = await claimEscrowRelease(context.database, {
    paymentId: payment.id,
    now: input.now,
    retryAfterInMs: RETRY_UNCONFIRMED_AFTER_IN_MS,
  });
  if (!claimed || payment.escrowId === null) {
    return { kind: "kept", action: "release" };
  }
  const escrowId = payment.escrowId;
  try {
    await withAsaasAccount(context, input.account, async (client) =>
      client.releaseEscrow(escrowId),
    );
  } catch (error) {
    // Unknown or refused: the next round reads the guarantee back before anything else.
    logger.warn("asaas.release_unconfirmed", { shipmentPaymentId: payment.id, error });
    return { kind: "kept", action: "release" };
  }
  await markEscrowReleased(context.database, { paymentId: payment.id, now: input.now });
  logger.info("asaas.escrow_released", { shipmentPaymentId: payment.id });
  return { kind: "released" };
}

/** True when this round is the first to ask for the refund, or an unconfirmed one may be retried. */
function mayAskRefund(previous: Date | null, requested: ShipmentPayment, now: Date): boolean {
  if (previous === null) {
    return true;
  }
  return (
    requested.refundRequestedAt !== null &&
    now.getTime() - requested.refundRequestedAt.getTime() >= RETRY_UNCONFIRMED_AFTER_IN_MS
  );
}

async function refund(
  context: AsaasContext,
  input: {
    account: SupplierPaymentAccount;
    held: HeldPayment;
    reason: ShipmentPaymentRefundReason;
    now: Date;
  },
): Promise<HeldMoneyOutcome> {
  const { payment } = input.held;
  const requested = await requestShipmentPaymentRefund(context.database, {
    paymentId: payment.id,
    reason: input.reason,
    now: input.now,
  });
  const chargeId = payment.providerPaymentId;
  if (
    requested === null ||
    chargeId === null ||
    !mayAskRefund(payment.refundRequestedAt, requested, input.now)
  ) {
    return { kind: "kept", action: "refund" };
  }
  try {
    await withAsaasAccount(context, input.account, async (client) =>
      client.refundCharge(chargeId, "Pagamento devolvido pelo SellBridge"),
    );
  } catch (error) {
    if (isAsaasError(error) && !error.outcomeUnknown) {
      await refundRefused(
        context,
        input.held,
        error.issues.join(" ") || `http_${error.status}`,
        input.now,
      );
      return { kind: "refund_refused" };
    }
    logger.warn("asaas.refund_unconfirmed", { shipmentPaymentId: payment.id, error });
    return { kind: "kept", action: "refund" };
  }
  logger.info("asaas.refund_requested", { shipmentPaymentId: payment.id, reason: input.reason });
  return { kind: "refund_requested", reason: input.reason };
}

async function refundRefused(context: AsaasContext, held: HeldPayment, why: string, now: Date) {
  const first = await markShipmentPaymentRefundFailed(context.database, {
    paymentId: held.payment.id,
    error: why,
    now,
  });
  if (first) {
    logger.error("asaas.refund_refused", {
      reason: `O Asaas não aceitou devolver ${formatCents(held.payment.amountCents)} ao revendedor: ${why}`,
      problemKey: held.payment.id,
      shipmentPaymentId: held.payment.id,
      tenantId: held.tenantId,
      orderId: held.orderId,
    });
  }
}

/**
 * Applies the release rule to one held payment: frees the money to the supplier seven days after
 * the confirmed delivery, gives it back to the reseller when the parcel was cancelled, returned or
 * never delivered, and reports to the team what no rule decides or what is close to Asaas's
 * own deadline.
 */
export async function settleHeldPayment(
  context: AsaasContext,
  input: { account: SupplierPaymentAccount; held: HeldPayment; now: Date },
): Promise<HeldMoneyOutcome> {
  const state = holdState(input.held, input.now);
  const action = escrowActionFor(state);
  if (action.kind === "release") {
    return release(context, {
      account: input.account,
      payment: input.held.payment,
      now: input.now,
    });
  }
  if (action.kind === "refund") {
    const reason = action.reason === "team" ? "team" : action.reason;
    return refund(context, { ...input, reason });
  }
  if (action.kind === "paused" && action.reason === "return_claim") {
    reportNeedsDecision(input.held, "o revendedor abriu uma devolução.");
  }
  if (action.kind === "paused" && action.reason === "cancelled_after_accept") {
    reportNeedsDecision(
      input.held,
      "o revendedor cancelou depois que o fornecedor aceitou. Confira com o fornecedor se ele já postou.",
    );
  }
  if (action.kind !== "paused" && escrowNeedsAttention(state)) {
    reportNeedsDecision(
      input.held,
      "o prazo de segurança do Asaas está acabando e a entrega não foi confirmada.",
    );
  }
  return { kind: "kept", action: action.kind };
}
