import {
  applyProviderPayment,
  findShipmentPaymentById,
  listShipmentPaymentCheckouts,
  markEscrowReleased,
  saveShipmentPaymentEscrow,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { formatCents } from "@sellbridge/shared/money";
import { endOfBrazilDay } from "@sellbridge/shared/period-range";
import { z } from "zod";
import { withAsaasAccount } from "./account-access.ts";
import {
  asaasChargeState,
  chargesWithMoneyTaken,
  platformShareCents,
  type AsaasChargeState,
} from "./charge-state.ts";
import type { AsaasContext } from "./context.ts";
import { AsaasError } from "./http.ts";
import { centsFromAsaasValue } from "./money.ts";
import type { AsaasPayment } from "./schemas.ts";

export type AsaasSyncResult =
  | { kind: "applied"; payment: ShipmentPayment; charge: AsaasChargeState }
  | { kind: "ignored"; reason: string };

const externalReferenceSchema = z.uuid();

/**
 * Asaas sends only the day the money came in (YYYY-MM-DD, São Paulo), never the time. The supplier's
 * accept and dispatch times count from the payment, so it is recorded at the latest moment it can
 * have happened: now for a payment of today, the end of the day for one SellBridge sees later.
 * Either way the supplier's times never start before the reseller really paid.
 */
function approvedAtOf(paidOn: string | null, chargeId: string, now: Date): Date {
  if (paidOn === null) {
    return now;
  }
  const afterPaidDay = endOfBrazilDay(paidOn.slice(0, 10));
  if (afterPaidDay === null) {
    throw new AsaasError(`Asaas sent an invalid payment date "${paidOn}" on charge ${chargeId}`, {
      status: null,
    });
  }
  const lastMomentOfPaidDay = afterPaidDay.getTime() - 1;
  return new Date(Math.min(now.getTime(), lastMomentOfPaidDay));
}

/**
 * Why the charge does not settle the parcel, or null when it does: it must be one SellBridge
 * opened for this parcel, for that amount, with SellBridge's fee in its split.
 */
async function chargeRefusal(
  context: AsaasContext,
  local: ShipmentPayment,
  charge: AsaasPayment,
): Promise<string | null> {
  const checkouts = await listShipmentPaymentCheckouts(context.database, local.id);
  const checkout = checkouts.find((candidate) => candidate.preferenceId === charge.id);
  if (checkout === undefined) {
    return "outside_checkout";
  }
  if (centsFromAsaasValue(charge.value) !== checkout.amountCents) {
    return "amount_mismatch";
  }
  if (platformShareCents(charge, context.settings.walletId) !== checkout.platformFeeCents) {
    return "fee_mismatch";
  }
  return null;
}

async function parcelOf(
  context: AsaasContext,
  account: SupplierPaymentAccount,
  charge: AsaasPayment,
): Promise<{ local: ShipmentPayment } | { reason: string }> {
  const reference = externalReferenceSchema.safeParse(charge.externalReference);
  if (!reference.success) {
    return { reason: "foreign_reference" };
  }
  const local = await findShipmentPaymentById(context.database, reference.data);
  if (local?.provider !== "asaas" || local.supplierId !== account.supplierId) {
    return { reason: "unknown_payment" };
  }
  return { local };
}

/**
 * The guarantee ended while SellBridge neither released nor refunded the money and before its
 * deadline: nothing SellBridge decided freed it, so the team has to look.
 */
function endedWithoutSellBridge(payment: ShipmentPayment, expiresAt: Date, now: Date): boolean {
  return (
    payment.releasedAt === null &&
    payment.releaseRequestedAt === null &&
    payment.refundRequestedAt === null &&
    now.getTime() < expiresAt.getTime()
  );
}

function logEndedWithoutSellBridge(payment: ShipmentPayment, escrowId: string): void {
  logger.error("asaas.escrow_ended_unexpectedly", {
    reason: `O dinheiro protegido de ${formatCents(payment.amountCents)} saiu da proteção no Asaas antes do prazo, sem o SellBridge liberar nem devolver. Confira a cobrança no Asaas.`,
    problemKey: escrowId,
    shipmentPaymentId: payment.id,
    shipmentId: payment.shipmentId,
    supplierId: payment.supplierId,
  });
}

/** Keeps the guarantee as Asaas reports it; one ended without SellBridge counts as released. */
async function saveEscrow(
  context: AsaasContext,
  payment: ShipmentPayment,
  state: AsaasChargeState,
): Promise<void> {
  if (state.escrow === null || state.escrowId === null) {
    return;
  }
  await saveShipmentPaymentEscrow(context.database, {
    paymentId: payment.id,
    escrowId: state.escrowId,
    escrowStatus: state.escrow.status,
    escrowExpiresAt: state.escrow.expiresAt,
  });
  if (
    state.escrow.status !== "done" ||
    state.status !== "approved" ||
    state.escrowEndedWithoutRelease ||
    state.refundInProgress
  ) {
    return;
  }
  const now = new Date();
  if (endedWithoutSellBridge(payment, state.escrow.expiresAt, now)) {
    logEndedWithoutSellBridge(payment, state.escrowId);
  }
  await markEscrowReleased(context.database, { paymentId: payment.id, now });
}

/** A refused charge that took the reseller's money goes to the team; an unpaid one only to the log. */
function logRefusal(payment: ShipmentPayment, charge: AsaasPayment, refusal: string): void {
  if (chargesWithMoneyTaken([charge]).length === 0) {
    logger.warn("asaas.payment_refused", { shipmentPaymentId: payment.id, reason: refusal });
    return;
  }
  logger.error("asaas.paid_charge_refused", {
    reason: `Um pagamento de ${formatCents(centsFromAsaasValue(charge.value))} entrou no Asaas do fornecedor fora da cobrança aberta pelo SellBridge. Confira no Asaas e devolva ao revendedor ou acerte com o fornecedor.`,
    problemKey: charge.id,
    refusal,
    shipmentPaymentId: payment.id,
    shipmentId: payment.shipmentId,
    supplierId: payment.supplierId,
    chargeId: charge.id,
  });
}

function logDuplicate(payment: ShipmentPayment, duplicateChargeId: string): void {
  // Two paid charges for one parcel: the reseller paid twice and one must go back by hand.
  logger.error("asaas.duplicate_payment", {
    reason: `Pagamento em dobro ao fornecedor (${formatCents(payment.amountCents)}): devolva um dos pagamentos ao revendedor no Asaas.`,
    problemKey: duplicateChargeId,
    shipmentPaymentId: payment.id,
    shipmentId: payment.shipmentId,
    supplierId: payment.supplierId,
    recordedPaymentId: payment.providerPaymentId,
    duplicatePaymentId: duplicateChargeId,
  });
}

/**
 * Records what Asaas says about one charge on the parcel it was opened for: its status, how it
 * was paid and the guarantee holding the money. A charge SellBridge did not open for the parcel,
 * for its amount and fee, is ignored; a second paid charge is reported as a duplicate.
 */
export async function applyAsaasCharge(
  context: AsaasContext,
  input: { account: SupplierPaymentAccount; charge: AsaasPayment },
): Promise<AsaasSyncResult> {
  const parcel = await parcelOf(context, input.account, input.charge);
  if ("reason" in parcel) {
    return { kind: "ignored", reason: parcel.reason };
  }
  const refusal = await chargeRefusal(context, parcel.local, input.charge);
  if (refusal !== null) {
    logRefusal(parcel.local, input.charge, refusal);
    return { kind: "ignored", reason: refusal };
  }
  const state = asaasChargeState(input.charge);
  const paidOn = input.charge.confirmedDate ?? input.charge.paymentDate ?? null;
  const outcome = await applyProviderPayment(context.database, {
    paymentId: parcel.local.id,
    providerPaymentId: input.charge.id,
    status: state.status,
    paymentMethod: state.paymentMethod,
    approvedAt: approvedAtOf(paidOn, input.charge.id, new Date()),
  });
  if (outcome === null) {
    return { kind: "ignored", reason: "unknown_payment" };
  }
  if (outcome.kind === "duplicate") {
    logDuplicate(outcome.payment, input.charge.id);
    return { kind: "ignored", reason: "duplicate" };
  }
  await saveEscrow(context, outcome.payment, state);
  const saved = await findShipmentPaymentById(context.database, outcome.payment.id);
  return { kind: "applied", payment: saved ?? outcome.payment, charge: state };
}

/** Reads one charge back from Asaas with the supplier's key and records it. */
export async function syncAsaasCharge(
  context: AsaasContext,
  input: { account: SupplierPaymentAccount; chargeId: string },
): Promise<AsaasSyncResult> {
  const charge = await withAsaasAccount(context, input.account, async (client) =>
    client.getCharge(input.chargeId),
  );
  return applyAsaasCharge(context, { account: input.account, charge });
}

/**
 * Reads back every charge carrying the parcel's reference, so a lost notice never leaves a
 * parcel looking unpaid, and a second paid charge always shows up on Problemas.
 */
export async function reconcileAsaasParcel(
  context: AsaasContext,
  input: { account: SupplierPaymentAccount; payment: ShipmentPayment },
): Promise<void> {
  const charges = await withAsaasAccount(context, input.account, async (client) =>
    client.findCharges(input.payment.id),
  );
  // The recorded charge first, so any other paid one is the duplicate.
  const ordered = charges.toSorted(
    (first, second) =>
      Number(second.id === input.payment.providerPaymentId) -
      Number(first.id === input.payment.providerPaymentId),
  );
  for (const charge of ordered) {
    await applyAsaasCharge(context, { account: input.account, charge });
  }
}
