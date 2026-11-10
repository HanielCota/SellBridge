import {
  disconnectSupplierPaymentAccount,
  findPayableShipment,
  findSupplierPaymentAccount,
  getPaymentFeeSetting,
  listShipmentPaymentSummaries,
  listSuppliersReceivingPayments,
  savePaymentPreference,
  setPaymentFeeSetting,
  startShipmentPayment,
  type PayableShipment,
  type ShipmentPaymentSummary,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { SETTLED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import {
  platformFeeCents,
  supplierPaymentBadge,
  type SupplierPaymentBadge,
} from "@sellbridge/shared/shipment-payments";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import {
  mercadoPagoNotificationUrl,
  mercadoPagoSettings,
  PaymentAccountUnavailableError,
  supplierAccessToken,
  syncMercadoPagoPayment,
} from "./mercado-pago-accounts.server";
import { createMercadoPagoCheckout } from "./mercado-pago-client.server";
import {
  paymentAccountOwnerRefusal,
  type MercadoPagoSettings,
  type PaymentAccountActor,
} from "./mercado-pago-connection";

const PROVIDER = "mercado_pago";

/** The supplier's receiving page: whether paying here is on and how the account stands. */
export async function loadPaymentAccount(supplierId: string) {
  const settings = mercadoPagoSettings();
  const [account, fee] = await Promise.all([
    findSupplierPaymentAccount(database, { supplierId, provider: PROVIDER }),
    getPaymentFeeSetting(database),
  ]);
  return {
    available: settings !== null,
    status: account?.status ?? "none",
    connectedAt: account?.connectedAt.toISOString() ?? null,
    updatedAt: account?.updatedAt.toISOString() ?? null,
    feeBasisPoints: fee.basisPoints ?? 0,
  };
}

/** Unlinks the supplier's account; only the supplier itself, never a team visit. */
export async function unlinkPaymentAccount(input: {
  supplierId: string;
  actor: PaymentAccountActor;
}): Promise<{ unlinked: boolean }> {
  const refusal = paymentAccountOwnerRefusal(input.actor);
  if (refusal !== null) {
    throw validationError(refusal);
  }
  const unlinked = await disconnectSupplierPaymentAccount(database, {
    supplierId: input.supplierId,
    provider: PROVIDER,
  });
  logger.info("mercado_pago.account_unlinked", { supplierId: input.supplierId });
  return { unlinked };
}

function badgeFor(
  summary: ShipmentPaymentSummary | undefined,
  supplierReceivesHere: boolean,
): SupplierPaymentBadge {
  return supplierPaymentBadge({
    payment:
      summary === undefined
        ? null
        : {
            status: summary.status,
            paidAt: summary.paidAt?.toISOString() ?? null,
            method: summary.paymentMethod,
          },
    supplierReceivesHere,
  });
}

/** The payment badge of each parcel of one supplier, for its order list. */
export async function supplierPaymentBadges(input: {
  supplierId: string;
  shipmentIds: readonly string[];
}): Promise<Map<string, SupplierPaymentBadge>> {
  const receivesHere = mercadoPagoSettings() !== null;
  const [summaries, receiving] = await Promise.all([
    listShipmentPaymentSummaries(database, input.shipmentIds),
    receivesHere
      ? listSuppliersReceivingPayments(database, {
          supplierIds: [input.supplierId],
          provider: PROVIDER,
        })
      : Promise.resolve(new Set<string>()),
  ]);
  const linked = receiving.has(input.supplierId);
  return new Map(input.shipmentIds.map((id) => [id, badgeFor(summaries.get(id), linked)]));
}

/** Why the reseller cannot pay this parcel here, or null when it can. */
function checkoutRefusal(payable: PayableShipment, linked: boolean): string | null {
  if (payable.catalogKind === "seller") {
    return "Este envio é do seu próprio estoque: não há fornecedor para pagar.";
  }
  if (SETTLED_FULFILLMENT_STATUSES.includes(payable.status)) {
    return "Este envio já foi encerrado: não dá mais para pagar por aqui.";
  }
  if (payable.amountCents <= 0) {
    return "Este pedido não tem o valor do fornecedor. Combine o pagamento com ele por fora.";
  }
  if (!linked) {
    return "Este fornecedor ainda não ligou a conta Mercado Pago. Combine o pagamento com ele por fora.";
  }
  return null;
}

/** What the reseller sees about paying the supplier of one parcel. */
export async function loadResellerSupplierPayment(input: { tenantId: string; shipmentId: string }) {
  const payable = await findPayableShipment(database, input);
  if (payable === null) {
    throw notFoundError("Envio não encontrado.");
  }
  const settings = mercadoPagoSettings();
  const receiving =
    settings === null
      ? new Set<string>()
      : await listSuppliersReceivingPayments(database, {
          supplierIds: [payable.supplierId],
          provider: PROVIDER,
        });
  const linked = receiving.has(payable.supplierId);
  const summary =
    payable.payment === null
      ? undefined
      : {
          status: payable.payment.status,
          paidAt: payable.payment.paidAt,
          paymentMethod: payable.payment.paymentMethod,
        };
  const badge = badgeFor(summary, linked);
  const refusal = checkoutRefusal(payable, linked);
  return {
    amountCents: payable.amountCents,
    badge,
    canPay: badge.kind === "waiting" && refusal === null,
    refusal,
  };
}

function orderPageUrl(orderId: string, shipmentId: string): string {
  const url = new URL(`/pedidos/${orderId}`, environment.APP_URL);
  url.searchParams.set("envio", shipmentId);
  return url.toString();
}

/** The parcel and its supplier's linked account, or the reason it cannot be paid here. */
async function payableWithAccount(input: { tenantId: string; shipmentId: string }) {
  const payable = await findPayableShipment(database, input);
  if (payable === null) {
    throw notFoundError("Envio não encontrado.");
  }
  const account = await findSupplierPaymentAccount(database, {
    supplierId: payable.supplierId,
    provider: PROVIDER,
  });
  const refusal = checkoutRefusal(payable, account?.status === "connected");
  if (refusal !== null || account === null) {
    throw validationError(refusal ?? "Este fornecedor ainda não ligou a conta Mercado Pago.");
  }
  return { payable, account };
}

async function checkoutAccessToken(
  settings: MercadoPagoSettings,
  account: SupplierPaymentAccount,
): Promise<string> {
  try {
    return await supplierAccessToken(settings, account);
  } catch (error) {
    if (error instanceof PaymentAccountUnavailableError) {
      throw validationError(
        "A conta Mercado Pago deste fornecedor precisa ser ligada de novo. Combine o pagamento com ele por fora.",
      );
    }
    throw error;
  }
}

/**
 * Starts the Mercado Pago checkout for a parcel: the preference is created with the supplier's
 * token, so the money lands in the supplier's account, with SellBridge's fee kept by Mercado Pago.
 *
 * @throws When the parcel cannot be paid here (see `checkoutRefusal`) or is already paid.
 */
export async function startSupplierCheckout(input: {
  tenantId: string;
  shipmentId: string;
  impersonatedBy: string | null;
}): Promise<{ checkoutUrl: string }> {
  if (input.impersonatedBy !== null) {
    throw validationError("Durante a visita da equipe não dá para pagar o fornecedor.");
  }
  const settings = mercadoPagoSettings();
  if (settings === null) {
    throw validationError("O pagamento pelo Mercado Pago ainda não está disponível.");
  }
  const { payable, account } = await payableWithAccount(input);
  const feeBasisPoints = (await getPaymentFeeSetting(database)).basisPoints ?? 0;
  const payment = await startShipmentPayment(database, {
    shipmentId: payable.shipmentId,
    supplierId: payable.supplierId,
    provider: PROVIDER,
    amountCents: payable.amountCents,
    platformFeeCents: platformFeeCents(payable.amountCents, feeBasisPoints),
    platformFeeBasisPoints: feeBasisPoints,
  });
  if (payment === null) {
    throw validationError("Este fornecedor já foi pago por este pedido.");
  }
  const checkout = await createMercadoPagoCheckout(settings, {
    accessToken: await checkoutAccessToken(settings, account),
    checkout: {
      title: `Pedido ${payable.externalOrderId} · ${payable.supplierName}`,
      amountCents: payment.amountCents,
      platformFeeCents: payment.platformFeeCents,
      externalReference: payment.id,
      returnUrl: orderPageUrl(payable.orderId, payable.shipmentId),
      notificationUrl: mercadoPagoNotificationUrl(),
    },
  });
  await savePaymentPreference(database, {
    paymentId: payment.id,
    preferenceId: checkout.preferenceId,
  });
  logger.info("mercado_pago.checkout_started", {
    shipmentPaymentId: payment.id,
    amountCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
  });
  return { checkoutUrl: checkout.checkoutUrl };
}

/**
 * The reseller is back from the checkout with the payment's id: it is read from Mercado Pago
 * right away, so the badge does not wait for the notice (which never reaches a local server).
 */
export async function confirmSupplierPaymentReturn(input: {
  tenantId: string;
  shipmentId: string;
  providerPaymentId: string;
}) {
  const settings = mercadoPagoSettings();
  const payable = await findPayableShipment(database, input);
  if (payable === null) {
    throw notFoundError("Envio não encontrado.");
  }
  if (settings === null || payable.payment === null) {
    return loadResellerSupplierPayment(input);
  }
  const account = await findSupplierPaymentAccount(database, {
    supplierId: payable.supplierId,
    provider: PROVIDER,
  });
  if (account !== null && account.status === "connected") {
    const result = await syncMercadoPagoPayment({
      settings,
      account,
      providerPaymentId: input.providerPaymentId,
    });
    if (result.kind === "ignored") {
      logger.warn("mercado_pago.return_ignored", { reason: result.reason });
    }
  }
  return loadResellerSupplierPayment(input);
}

/** The fee rate the admin sees and edits. */
export async function loadPaymentFee() {
  const fee = await getPaymentFeeSetting(database);
  return {
    basisPoints: fee.basisPoints,
    updatedAt: fee.updatedAt?.toISOString() ?? null,
  };
}

export async function savePaymentFee(input: { basisPoints: number; userId: string }) {
  const saved = await setPaymentFeeSetting(database, input);
  logger.info("platform_settings.payment_fee_changed", { basisPoints: saved.basisPoints });
  return { basisPoints: saved.basisPoints, updatedAt: saved.updatedAt?.toISOString() ?? null };
}
