import {
  applyProviderPayment,
  findShipmentPaymentById,
  listShipmentPaymentCheckouts,
  type ShipmentPayment,
  type ShipmentPaymentCheckout,
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

/** What the reseller was charged through one checkout. */
interface Charge {
  amountCents: number;
  platformFeeCents: number;
}

const externalReferenceSchema = z.uuid();

/** Why a payment did not go to the supplier's linked account in reais, or null when it did. */
function accountMismatch(
  remote: MercadoPagoPayment,
  account: SupplierPaymentAccount,
): string | null {
  if (remote.collectorId !== null && remote.collectorId !== account.providerAccountId) {
    return "other_collector";
  }
  if (remote.currency !== null && remote.currency !== "BRL") {
    return "other_currency";
  }
  return null;
}

interface PaymentCheck {
  context: MercadoPagoContext;
  account: SupplierPaymentAccount;
  accessToken: string;
  remote: MercadoPagoPayment;
  local: ShipmentPayment;
  /** The checkout the caller already found the payment in, sparing a second listing. */
  knownCheckout?: ShipmentPaymentCheckout;
}

async function checkoutPaymentIds(input: PaymentCheck, preferenceId: string): Promise<string[]> {
  return withSupplierAccount(input.context, input.account, async () =>
    listPreferencePaymentIds(input.context.settings, {
      accessToken: input.accessToken,
      preferenceId,
    }),
  );
}

/**
 * The checkout SellBridge opened for this parcel that the payment came through, newest first,
 * or why there is none. A supplier's own charge naming the parcel is in none of them.
 */
async function checkoutOfPayment(
  input: PaymentCheck,
): Promise<{ checkout: ShipmentPaymentCheckout } | { refusal: string }> {
  if (input.knownCheckout !== undefined) {
    return { checkout: input.knownCheckout };
  }
  const checkouts = await listShipmentPaymentCheckouts(input.context.database, input.local.id);
  if (checkouts.length === 0) {
    return { refusal: "no_checkout" };
  }
  // A parcel opens a new checkout only after the previous one closed: they are few.
  const paymentIdsByCheckout = await Promise.all(
    checkouts.map(async (checkout) => checkoutPaymentIds(input, checkout.preferenceId)),
  );
  const checkout = checkouts.find((_, index) =>
    (paymentIdsByCheckout[index] ?? []).includes(input.remote.id),
  );
  if (checkout === undefined) {
    return { refusal: "outside_checkout" };
  }
  return { checkout };
}

/**
 * What a payment not yet recorded on the parcel was charged, when it came through one of the
 * parcel's checkouts with exactly that checkout's amount and SellBridge's fee; otherwise why it
 * may not be recorded, logged.
 */
async function newPaymentCharge(
  input: PaymentCheck,
): Promise<{ charge: Charge } | { refusal: string }> {
  const found = await checkoutOfPayment(input);
  if ("refusal" in found) {
    return refused(input, found.refusal);
  }
  const { checkout } = found;
  if (input.remote.amountCents !== checkout.amountCents) {
    return refused(input, "amount_mismatch");
  }
  if (input.remote.applicationFeeCents !== checkout.platformFeeCents) {
    return refused(input, "fee_mismatch");
  }
  return {
    charge: { amountCents: checkout.amountCents, platformFeeCents: checkout.platformFeeCents },
  };
}

function refused(input: PaymentCheck, refusal: string): { refusal: string } {
  logger.warn("mercado_pago.payment_refused", {
    shipmentPaymentId: input.local.id,
    reason: refusal,
    receivedFeeCents: input.remote.applicationFeeCents,
  });
  return { refusal };
}

/**
 * The charge to record for the payment, or why it does not settle the parcel. The payment already
 * recorded is checked against the parcel's own amount only: it passed the checkout checks when
 * first recorded, and a later refund may change its fee.
 */
async function chargeToRecord(
  input: PaymentCheck,
): Promise<{ charge: Charge | undefined } | { refusal: string }> {
  const mismatch = accountMismatch(input.remote, input.account);
  if (mismatch !== null) {
    logger.warn("mercado_pago.payment_mismatch", {
      shipmentPaymentId: input.local.id,
      reason: mismatch,
    });
    return { refusal: mismatch };
  }
  if (input.local.providerPaymentId !== input.remote.id) {
    return newPaymentCharge(input);
  }
  if (input.remote.amountCents !== input.local.amountCents) {
    logger.warn("mercado_pago.payment_mismatch", {
      shipmentPaymentId: input.local.id,
      reason: "amount_mismatch",
    });
    return { refusal: "amount_mismatch" };
  }
  return { charge: undefined };
}

export interface PaymentSyncInput {
  account: SupplierPaymentAccount;
  providerPaymentId: string;
  /** The parcel payment the caller expects, when a buyer's return names the payment. */
  expectedPaymentId?: string;
  /** The parcel checkout the caller already listed this payment in. */
  knownCheckout?: ShipmentPaymentCheckout;
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

/** The parcel payment a Mercado Pago payment names, or why it is not one of this supplier's. */
async function parcelPaymentOf(
  context: MercadoPagoContext,
  input: PaymentSyncInput,
  remote: MercadoPagoPayment,
): Promise<{ local: ShipmentPayment } | { reason: string }> {
  const reference = externalReferenceSchema.safeParse(remote.externalReference);
  if (!reference.success) {
    return { reason: "foreign_reference" };
  }
  if (input.expectedPaymentId !== undefined && reference.data !== input.expectedPaymentId) {
    return { reason: "other_parcel" };
  }
  const local = await findShipmentPaymentById(context.database, reference.data);
  if (local === null || local.supplierId !== input.account.supplierId) {
    return { reason: "unknown_payment" };
  }
  return { local };
}

function logSynced(outcome: { kind: string; payment: ShipmentPayment }, providerPaymentId: string) {
  if (outcome.kind === "duplicate") {
    // Two approved payments for one parcel: the reseller paid twice and must be refunded by hand.
    logger.error("mercado_pago.duplicate_payment", {
      shipmentPaymentId: outcome.payment.id,
      providerPaymentId,
    });
  }
  logger.info("mercado_pago.payment_synced", {
    shipmentPaymentId: outcome.payment.id,
    status: outcome.payment.status,
    outcome: outcome.kind,
  });
}

/**
 * Reads the payment from Mercado Pago with the supplier's token and records its status on the
 * parcel it was made for, recognized by the parcel's own reference. The payment must name one of
 * this supplier's parcels (the expected one, when the caller knows it) and be paid to the linked
 * account in reais. Before it is first recorded, it must also come through one of the checkouts
 * SellBridge opened for the parcel, with that checkout's amount and fee: a late payment through
 * an older checkout still settles the parcel. Anything else is ignored, never applied.
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
  const parcel = await parcelPaymentOf(context, input, remote);
  if ("reason" in parcel) {
    return { kind: "ignored", reason: parcel.reason };
  }
  const { local } = parcel;
  const check = { context, account, accessToken, remote, local };
  const toRecord = await chargeToRecord(
    input.knownCheckout === undefined ? check : { ...check, knownCheckout: input.knownCheckout },
  );
  if ("refusal" in toRecord) {
    return { kind: "ignored", reason: toRecord.refusal };
  }
  const outcome = await applyProviderPayment(context.database, {
    paymentId: local.id,
    providerPaymentId: remote.id,
    status: shipmentPaymentStatusFrom(remote.status),
    paymentMethod: remote.paymentMethod,
    approvedAt: remote.approvedAt,
    ...(toRecord.charge === undefined ? {} : { charged: toRecord.charge }),
  });
  if (outcome === null) {
    return { kind: "ignored", reason: "unknown_payment" };
  }
  logSynced(outcome, remote.id);
  return { kind: "applied", payment: outcome.payment };
}
