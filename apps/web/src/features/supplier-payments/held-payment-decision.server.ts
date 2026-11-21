import {
  findManualRefundCase,
  findOpenSupportTicketForOrder,
  findShipmentPaymentById,
  getNewSupplierRule,
  recordTeamDecision,
  setNewSupplierRule,
  type ShipmentPayment,
} from "@sellbridge/database/repositories";
import { manualRefundLastMoment } from "@sellbridge/payments/asaas";
import { notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { database } from "@/lib/server/database";

/** Whether the team may still choose what happens to this held payment. */
function isDecidable(payment: ShipmentPayment): boolean {
  return (
    payment.provider === "asaas" &&
    payment.status === "approved" &&
    payment.releasedAt === null &&
    payment.refundRequestedAt === null &&
    payment.teamDecision === null
  );
}

/** What the Problemas page shows next to a held payment that needs the team. */
export async function loadHeldPaymentDecision(shipmentPaymentId: string) {
  const payment = await findShipmentPaymentById(database, shipmentPaymentId);
  if (payment?.provider !== "asaas") {
    throw notFoundError("Pagamento não encontrado.");
  }
  return {
    amountCents: payment.amountCents,
    decidable: isDecidable(payment),
    decision: payment.teamDecision,
    decidedAt: payment.teamDecisionAt?.toISOString() ?? null,
    released: payment.releasedAt !== null,
    releasesItselfAt: payment.escrowExpiresAt?.toISOString() ?? null,
    refunded: payment.status === "refunded" || payment.refundRequestedAt !== null,
  };
}

/**
 * What the Problemas page shows for a refund Asaas refused: the team gives the money back by
 * hand, so it reads how much, to whom, from which supplier account, until when, and the ticket
 * the reseller opened about the order.
 */
export async function loadManualRefund(shipmentPaymentId: string) {
  const found = await findManualRefundCase(database, shipmentPaymentId);
  if (found?.payment.provider !== "asaas") {
    throw notFoundError("Pagamento não encontrado.");
  }
  const { payment } = found;
  const ticketId = await findOpenSupportTicketForOrder(database, {
    tenantId: found.tenantId,
    orderId: found.orderId,
  });
  return {
    amountCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
    paidByPix: payment.paymentMethod === "PIX",
    chargeId: payment.providerPaymentId,
    orderNumber: found.orderNumber,
    resellerName: found.resellerName,
    supplierName: found.supplierName,
    /** The last moment to give it back by hand: Asaas releases it to the supplier right after. */
    lastMoment: manualRefundLastMoment(payment, new Date()).toISOString(),
    ticketId,
    refunded: payment.status === "refunded",
  };
}

/**
 * The team's choice for a held payment no rule decides: give it back to the reseller or free it
 * to the supplier. The escrow job carries it out on its next round; it is recorded only once.
 */
export async function decideHeldPayment(input: {
  shipmentPaymentId: string;
  decision: "release" | "refund";
  userId: string;
}) {
  const decided = await recordTeamDecision(database, {
    paymentId: input.shipmentPaymentId,
    decision: input.decision,
    userId: input.userId,
    now: new Date(),
  });
  if (!decided) {
    throw validationError(
      "Este pagamento já foi liberado, devolvido ou decidido. Atualize a página para ver como ficou.",
    );
  }
  logger.info("asaas.team_decision_recorded", {
    shipmentPaymentId: input.shipmentPaymentId,
    decision: input.decision,
  });
  return loadHeldPaymentDecision(input.shipmentPaymentId);
}

export async function loadNewSupplierRule() {
  return getNewSupplierRule(database);
}

export async function saveNewSupplierRule(input: {
  enabled: boolean;
  deliveries: number;
  userId: string;
}) {
  const saved = await setNewSupplierRule(database, input);
  logger.info("supplier_payments.new_supplier_rule_saved", {
    enabled: saved.enabled,
    deliveries: saved.deliveries,
  });
  return saved;
}
