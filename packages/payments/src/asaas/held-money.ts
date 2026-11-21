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
  ESCROW_SAFETY_DEADLINE_IN_DAYS,
  escrowActionFor,
  escrowNeedsAttention,
  type EscrowAction,
  type EscrowHoldState,
} from "@sellbridge/shared/escrow-release";
import { logger } from "@sellbridge/shared/logger";
import { formatCents } from "@sellbridge/shared/money";
import { startOfBrazilDay } from "@sellbridge/shared/period-range";
import type { ShipmentPaymentRefundReason } from "@sellbridge/shared/shipment-payments";
import { platformClient, withAsaasAccount } from "./account-access.ts";
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
    await platformClient(context).releaseEscrow(escrowId);
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

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEADLINE_DAY = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});
const PAID_BY: Readonly<Record<string, string>> = { PIX: " por Pix", CREDIT_CARD: " no cartão" };

/**
 * The moment Asaas stops holding the money and hands it to the supplier: the start (Brasília) of
 * the guarantee's expiration day, or of the day the longest guarantee ends, counted from the
 * day of the payment.
 */
function manualRefundDeadline(payment: ShipmentPayment, now: Date): Date {
  if (payment.escrowExpiresAt !== null) {
    return payment.escrowExpiresAt;
  }
  const paidDay = startOfBrazilDay(payment.paidAt ?? now);
  return new Date(paidDay.getTime() + ESCROW_SAFETY_DEADLINE_IN_DAYS * DAY_IN_MS);
}

/**
 * The last moment the money can still be given back by hand: just before Asaas releases it, so
 * a day label shows the last whole day (a guarantee ending on 20/12 leaves until 19/12).
 */
export function manualRefundLastMoment(payment: ShipmentPayment, now: Date): Date {
  return new Date(manualRefundDeadline(payment, now).getTime() - 1);
}

/** What the team reads on Problemas: this refund is theirs to make by hand, and until when. */
function manualRefundReason(payment: ShipmentPayment, now: Date): string {
  const paidBy = PAID_BY[payment.paymentMethod ?? ""] ?? "";
  const day = DEADLINE_DAY.format(manualRefundLastMoment(payment, now));
  return `Devolução manual: o Asaas não devolveu sozinho ${formatCents(payment.amountCents)} pagos${paidBy}. Alguém da equipe devolve ao revendedor pelo Asaas até ${day}; depois disso o valor vai para o fornecedor.`;
}

async function refundRefused(context: AsaasContext, held: HeldPayment, why: string, now: Date) {
  const first = await markShipmentPaymentRefundFailed(context.database, {
    paymentId: held.payment.id,
    error: why,
    now,
  });
  if (first) {
    logger.error("asaas.refund_refused", {
      reason: manualRefundReason(held.payment, now),
      problemKey: held.payment.id,
      refusal: why,
      shipmentPaymentId: held.payment.id,
      shipmentId: held.payment.shipmentId,
      supplierId: held.payment.supplierId,
      tenantId: held.tenantId,
      orderId: held.orderId,
    });
  }
}

/**
 * For a held payment whose supplier account SellBridge cannot use (key refused, protection
 * missing): nothing can be released or refunded through it, so a parcel that needs a refund, a
 * decision or is close to Asaas's deadline goes to the team instead of waiting in silence.
 */
export function reportHeldWithoutAccount(held: HeldPayment, now: Date): void {
  const state = holdState(held, now);
  const action = escrowActionFor(state);
  const needsSomeone =
    action.kind === "refund" || action.kind === "paused" || escrowNeedsAttention(state);
  if (!needsSomeone) {
    return;
  }
  reportNeedsDecision(
    held,
    "a conta Asaas do fornecedor está fora do ar no SellBridge, então nada pode ser devolvido nem liberado por aqui. Peça ao fornecedor para ligar a conta de novo ou resolva direto no Asaas.",
  );
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
  if (action.kind === "paused" && action.reason === "chargeback") {
    reportNeedsDecision(
      input.held,
      "o comprador contestou o pagamento no cartão. Acompanhe a disputa no Asaas.",
    );
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
