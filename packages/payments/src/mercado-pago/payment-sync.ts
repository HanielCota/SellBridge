import {
  applyProviderPayment,
  findShipmentPaymentById,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { shipmentPaymentStatusFrom } from "@sellbridge/shared/shipment-payments";
import { z } from "zod";
import { supplierAccessToken, UNAUTHORIZED, withSupplierAccount } from "./account-access.ts";
import {
  getMercadoPagoPayment,
  isMercadoPagoError,
  listPreferencePaymentIds,
  type MercadoPagoPayment,
} from "./client.ts";
import type { MercadoPagoContext } from "./context.ts";

/** What syncing a payment did, for the logs and the tests. */
export type PaymentSyncResult =
  { kind: "applied"; payment: ShipmentPayment } | { kind: "ignored"; reason: string };

const externalReferenceSchema = z.uuid();

/** Why a payment read back from Mercado Pago does not settle this parcel, or null when it does. */
function mismatchReason(
  remote: MercadoPagoPayment,
  local: ShipmentPayment,
  account: SupplierPaymentAccount,
): string | null {
  if (remote.collectorId !== null && remote.collectorId !== account.providerAccountId) {
    return "other_collector";
  }
  if (remote.currency !== null && remote.currency !== "BRL") {
    return "other_currency";
  }
  if (remote.amountCents !== local.amountCents) {
    return "amount_mismatch";
  }
  return null;
}

interface PaymentCheck {
  context: MercadoPagoContext;
  account: SupplierPaymentAccount;
  accessToken: string;
  remote: MercadoPagoPayment;
  local: ShipmentPayment;
}

/**
 * Why a payment not yet recorded on the parcel did not come from SellBridge's checkout for it, or
 * null when it did: it must keep exactly the fee set on the parcel's preference and be one of
 * that preference's payments. A supplier's own charge naming the parcel fails here.
 */
async function checkoutRefusalReason(input: PaymentCheck): Promise<string | null> {
  const { remote, local } = input;
  if (remote.applicationFeeCents !== local.platformFeeCents) {
    return "fee_mismatch";
  }
  const preferenceId = local.preferenceId;
  if (preferenceId === null) {
    return "no_checkout";
  }
  const checkoutPaymentIds = await withSupplierAccount(input.context, input.account, async () =>
    listPreferencePaymentIds(input.context.settings, {
      accessToken: input.accessToken,
      preferenceId,
    }),
  );
  if (checkoutPaymentIds.includes(remote.id)) {
    return null;
  }
  return "outside_checkout";
}

/**
 * The refusal of a payment not yet recorded on the parcel, logged, or null when it may be
 * recorded. Later notices for the recorded payment (refunds, chargebacks) are not checked again:
 * it was checked when recorded, and a refund may change its fee.
 */
async function newPaymentRefusal(input: PaymentCheck): Promise<string | null> {
  const { remote, local } = input;
  if (local.providerPaymentId === remote.id) {
    return null;
  }
  const refusal = await checkoutRefusalReason(input);
  if (refusal !== null) {
    logger.warn("mercado_pago.payment_refused", {
      shipmentPaymentId: local.id,
      reason: refusal,
      expectedFeeCents: local.platformFeeCents,
      receivedFeeCents: remote.applicationFeeCents,
    });
  }
  return refusal;
}

export interface PaymentSyncInput {
  account: SupplierPaymentAccount;
  providerPaymentId: string;
  /** The parcel payment the caller expects, when a buyer's return names the payment. */
  expectedPaymentId?: string;
}

/**
 * The payment named by a signed notice proves the token when it is refused. One named on the
 * buyer's return is any id the buyer typed: a refusal there may be about the payment, not the
 * token, so the supplier's account is never marked in error for it.
 */
async function readPaymentToSync(
  context: MercadoPagoContext,
  input: PaymentSyncInput,
  accessToken: string,
): Promise<MercadoPagoPayment | null> {
  const read = async () =>
    getMercadoPagoPayment(context.settings, { accessToken, paymentId: input.providerPaymentId });
  if (input.expectedPaymentId === undefined) {
    return withSupplierAccount(context, input.account, read);
  }
  try {
    return await read();
  } catch (error) {
    if (isMercadoPagoError(error) && error.status === UNAUTHORIZED) {
      return null;
    }
    throw error;
  }
}

/**
 * Reads the payment from Mercado Pago with the supplier's token and records its status on the
 * parcel it was made for. The payment must name one of this supplier's parcels (the expected one,
 * when the caller knows it), be paid to the linked account in reais and match the amount; before
 * it is first recorded, it must also come from the parcel's checkout with SellBridge's fee.
 * Anything else is ignored, never applied.
 */
export async function syncMercadoPagoPayment(
  context: MercadoPagoContext,
  input: PaymentSyncInput,
): Promise<PaymentSyncResult> {
  const { account } = input;
  const accessToken = await supplierAccessToken(context, account);
  const remote = await readPaymentToSync(context, input, accessToken);
  if (remote === null) {
    return { kind: "ignored", reason: "payment_unreadable" };
  }
  const reference = externalReferenceSchema.safeParse(remote.externalReference);
  if (!reference.success) {
    return { kind: "ignored", reason: "foreign_reference" };
  }
  if (input.expectedPaymentId !== undefined && reference.data !== input.expectedPaymentId) {
    return { kind: "ignored", reason: "other_parcel" };
  }
  const local = await findShipmentPaymentById(context.database, reference.data);
  if (local === null || local.supplierId !== account.supplierId) {
    return { kind: "ignored", reason: "unknown_payment" };
  }
  const mismatch = mismatchReason(remote, local, account);
  if (mismatch !== null) {
    logger.warn("mercado_pago.payment_mismatch", { shipmentPaymentId: local.id, reason: mismatch });
    return { kind: "ignored", reason: mismatch };
  }
  const refusal = await newPaymentRefusal({ context, account, accessToken, remote, local });
  if (refusal !== null) {
    return { kind: "ignored", reason: refusal };
  }
  const outcome = await applyProviderPayment(context.database, {
    paymentId: local.id,
    providerPaymentId: remote.id,
    status: shipmentPaymentStatusFrom(remote.status),
    paymentMethod: remote.paymentMethod,
    approvedAt: remote.approvedAt,
  });
  if (outcome === null) {
    return { kind: "ignored", reason: "unknown_payment" };
  }
  if (outcome.kind === "duplicate") {
    // Two approved payments for one parcel: the reseller paid twice and must be refunded by hand.
    logger.error("mercado_pago.duplicate_payment", {
      shipmentPaymentId: local.id,
      providerPaymentId: remote.id,
    });
  }
  logger.info("mercado_pago.payment_synced", {
    shipmentPaymentId: outcome.payment.id,
    status: outcome.payment.status,
    outcome: outcome.kind,
  });
  return { kind: "applied", payment: outcome.payment };
}
