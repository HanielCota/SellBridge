import {
  releaseShipmentPaymentReservation,
  savePaymentPreference,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { withAsaasAccount } from "./account-access.ts";
import { chargeMatchesParcel, chargesWithMoneyTaken } from "./charge-state.ts";
import { applyAsaasCharge } from "./charge-sync.ts";
import type { AsaasAccountClient } from "./client.ts";
import type { AsaasContext } from "./context.ts";
import { isAsaasError } from "./http.ts";
import { asaasDueDate } from "./money.ts";
import type { AsaasPayment } from "./schemas.ts";

/** Days the reseller has to pay a charge; boleto needs at least one business day. */
export const CHARGE_DUE_IN_DAYS = 2;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface AsaasPayer {
  /** SellBridge's id of the reseller: one Asaas customer per reseller in each supplier account. */
  readonly tenantId: string;
  readonly name: string;
  /** Digits only. */
  readonly cpfCnpj: string;
}

export type ChargeOpening =
  | { kind: "opened"; checkoutUrl: string }
  /** A paid charge already exists for the parcel: it was recorded, no new one was opened. */
  | { kind: "already_paid" };

async function customerId(client: AsaasAccountClient, payer: AsaasPayer): Promise<string> {
  const found = await client.findCustomerId(payer.tenantId);
  if (found !== null) {
    return found;
  }
  return client.createCustomer({
    name: payer.name,
    cpfCnpj: payer.cpfCnpj,
    externalReference: payer.tenantId,
  });
}

const UNPAID_STATUSES = new Set(["PENDING", "OVERDUE"]);

function unpaidCharges(charges: readonly AsaasPayment[]): AsaasPayment[] {
  return charges.filter((charge) => charge.deleted !== true && UNPAID_STATUSES.has(charge.status));
}

async function saveCharge(
  context: AsaasContext,
  payment: ShipmentPayment,
  charge: AsaasPayment,
  now: Date,
): Promise<string> {
  const checkoutUrl = charge.invoiceUrl ?? "";
  await savePaymentPreference(context.database, {
    paymentId: payment.id,
    preferenceId: charge.id,
    checkoutUrl,
    checkoutExpiresAt: new Date(now.getTime() + CHARGE_DUE_IN_DAYS * DAY_IN_MS),
    amountCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
  });
  return checkoutUrl;
}

/**
 * Opens the Asaas charge for a parcel just reserved, in the supplier's account, with SellBridge's
 * fee in the split; the reseller pays on Asaas's page. Asaas has no idempotency key, so the
 * parcel's charges are listed first: a paid one is recorded, an open one is reused.
 */
export async function openAsaasCharge(
  context: AsaasContext,
  input: {
    account: SupplierPaymentAccount;
    payment: ShipmentPayment;
    payer: AsaasPayer;
    description: string;
    successUrl: string;
    now: Date;
  },
): Promise<ChargeOpening> {
  const { account, payment } = input;
  return withAsaasAccount(context, account, async (client) => {
    const existing = await client.findCharges(payment.id);
    const paid = chargesWithMoneyTaken(existing);
    if (paid.length > 0) {
      for (const charge of paid) {
        await applyAsaasCharge(context, { account, charge });
      }
      return { kind: "already_paid" };
    }
    const unpaid = unpaidCharges(existing);
    const reusable = unpaid.find(
      (charge) =>
        charge.status === "PENDING" &&
        chargeMatchesParcel(charge, payment, context.settings.walletId),
    );
    // Any other open charge (overdue, or not asking what the parcel asks) could still be paid:
    // it goes before the reseller pays, never beside the one that counts.
    for (const stale of unpaid) {
      if (stale.id !== reusable?.id) {
        await client.deleteCharge(stale.id);
      }
    }
    if (reusable !== undefined) {
      return {
        kind: "opened",
        checkoutUrl: await saveCharge(context, payment, reusable, input.now),
      };
    }
    const charge = await createCharge(context, client, input);
    logger.info("asaas.charge_opened", {
      shipmentPaymentId: payment.id,
      amountCents: payment.amountCents,
      platformFeeCents: payment.platformFeeCents,
    });
    return { kind: "opened", checkoutUrl: await saveCharge(context, payment, charge, input.now) };
  });
}

/**
 * A refused creation frees the parcel at once; one whose outcome is unknown keeps it reserved,
 * and the next attempt finds the charge if Asaas did create it.
 */
async function createCharge(
  context: AsaasContext,
  client: AsaasAccountClient,
  input: Parameters<typeof openAsaasCharge>[1],
): Promise<AsaasPayment> {
  try {
    return await client.createCharge({
      customerId: await customerId(client, input.payer),
      amountCents: input.payment.amountCents,
      dueDate: asaasDueDate(input.now, CHARGE_DUE_IN_DAYS),
      description: input.description,
      externalReference: input.payment.id,
      platformWalletId: context.settings.walletId,
      platformFeeCents: input.payment.platformFeeCents,
      successUrl: input.successUrl,
    });
  } catch (error) {
    if (isAsaasError(error) && !error.outcomeUnknown) {
      await releaseShipmentPaymentReservation(context.database, input.payment.id);
    }
    throw error;
  }
}

/**
 * Before a parcel that started on Asaas is charged elsewhere (the supplier switched): a paid
 * charge is recorded and blocks the switch; unpaid ones are removed, so none can be paid later.
 */
export async function closeAsaasChargesBeforeSwitch(
  context: AsaasContext,
  input: { account: SupplierPaymentAccount; payment: ShipmentPayment },
): Promise<"paid" | "closed"> {
  const { account, payment } = input;
  return withAsaasAccount(context, account, async (client) => {
    const existing = await client.findCharges(payment.id);
    const paid = chargesWithMoneyTaken(existing);
    for (const charge of paid) {
      await applyAsaasCharge(context, { account, charge });
    }
    if (paid.length > 0) {
      return "paid";
    }
    for (const charge of unpaidCharges(existing)) {
      await client.deleteCharge(charge.id);
    }
    return "closed";
  });
}
