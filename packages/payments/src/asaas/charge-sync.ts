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
import { z } from "zod";
import { withAsaasAccount } from "./account-access.ts";
import { asaasChargeState, type AsaasChargeState } from "./charge-state.ts";
import type { AsaasContext } from "./context.ts";
import { centsFromAsaasValue } from "./money.ts";
import type { AsaasPayment } from "./schemas.ts";

export type AsaasSyncResult =
  | { kind: "applied"; payment: ShipmentPayment; charge: AsaasChargeState }
  | { kind: "ignored"; reason: string };

const externalReferenceSchema = z.uuid();

/** SellBridge's share in the charge's split, in cents (zero when it has none). */
function platformShareCents(charge: AsaasPayment, walletId: string): number {
  const share = (charge.split ?? []).find((entry) => entry.walletId === walletId);
  return share?.fixedValue == null ? 0 : centsFromAsaasValue(share.fixedValue);
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
  if (state.escrow.status === "done" && state.status === "approved") {
    await markEscrowReleased(context.database, { paymentId: payment.id, now: new Date() });
  }
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
    logger.warn("asaas.payment_refused", { shipmentPaymentId: parcel.local.id, reason: refusal });
    return { kind: "ignored", reason: refusal };
  }
  const state = asaasChargeState(input.charge);
  const paidOn = input.charge.confirmedDate ?? input.charge.paymentDate ?? null;
  const outcome = await applyProviderPayment(context.database, {
    paymentId: parcel.local.id,
    providerPaymentId: input.charge.id,
    status: state.status,
    paymentMethod: state.paymentMethod,
    approvedAt: paidOn === null ? new Date() : new Date(`${paidOn.slice(0, 10)}T12:00:00-03:00`),
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
