import {
  findShipmentPaymentById,
  getNewSupplierRule,
  recordTeamDecision,
  setNewSupplierRule,
  type ShipmentPayment,
} from "@sellbridge/database/repositories";
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
    refunded: payment.status === "refunded" || payment.refundRequestedAt !== null,
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
