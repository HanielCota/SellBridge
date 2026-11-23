import {
  disconnectSupplierPaymentAccount,
  findOpenSupportTicketForOrder,
  findPayableShipment,
  findPreparationHold,
  findShipmentPayment,
  findSupplierPaymentAccount,
  listShipmentPaymentSummaries,
  openCheckoutUrl,
  releaseShipmentPaymentReservation,
  savePaymentPreference,
  reopenShipmentCheckout,
  startShipmentPayment,
  type PayableShipment,
  type ShipmentPayment,
  type ShipmentPaymentSummary,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { notFoundError, validationError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { SETTLED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import {
  PAYMENT_FEE_BASIS_POINTS,
  platformFeeCents,
  reforwardBlockFor,
  supplierPaymentBadge,
  type PaidParcelFate,
  type SupplierPaymentBadge,
  type SupplierPayMethod,
} from "@sellbridge/shared/shipment-payments";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import {
  CHECKOUT_TTL_IN_MS,
  createMercadoPagoCheckout,
  isMercadoPagoError,
  PaymentAccountUnavailableError,
  reconcileShipmentPayment,
  supplierAccessToken,
  syncMercadoPagoPayment,
  withSupplierAccount,
  type CheckoutRequest,
  type MercadoPagoContext,
} from "@sellbridge/payments/mercado-pago";
import { manualRefundLastMoment } from "@sellbridge/payments/asaas";
import {
  mercadoPagoContext,
  mercadoPagoNotificationUrl,
  mercadoPagoSettings,
} from "./mercado-pago-accounts.server";
import { paymentAccountOwnerRefusal, type PaymentAccountActor } from "./mercado-pago-connection";
import type { PaymentProviderName } from "@sellbridge/shared/payment-accounts";
import { asaasContext, receivingAccountsOf, type ReceivingAccounts } from "./asaas.server";
import { leaveAsaasCharges, openAsaasCheckout, refreshAsaasParcel } from "./asaas-checkout.server";

const PROVIDER = "mercado_pago";

/** The supplier's receiving page: whether paying here is on and how the account stands. */
export async function loadPaymentAccount(supplierId: string) {
  const settings = mercadoPagoSettings();
  const account = await findSupplierPaymentAccount(database, { supplierId, provider: PROVIDER });
  return {
    available: settings !== null,
    status: account?.status ?? "none",
    connectedAt: account?.connectedAt.toISOString() ?? null,
    updatedAt: account?.updatedAt.toISOString() ?? null,
    feeBasisPoints: PAYMENT_FEE_BASIS_POINTS,
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
  parcel?: PaidParcelFate,
): SupplierPaymentBadge {
  const paymentsOffered = asaasContext() !== null;
  return supplierPaymentBadge({
    payment:
      summary === undefined
        ? null
        : {
            status: summary.status,
            paidAt: summary.paidAt?.toISOString() ?? null,
            method: summary.paymentMethod,
            refundRequestedAt: summary.refundRequestedAt?.toISOString() ?? null,
          },
    supplierReceivesHere,
    paymentsOffered,
    ...(parcel === undefined ? {} : { parcel }),
  });
}

/** Parcels whose money is owed back to the reseller: cancelled, or back with the supplier. */
const ENDED_WITHOUT_DELIVERY: ReadonlySet<string> = new Set(["cancelled", "returned"]);

/**
 * What happened to the paid parcel: ended without a delivery, and whether the team settles it
 * (the reseller cancelled after the supplier accepted and no refund was asked for yet).
 */
function parcelFate(payable: PayableShipment): PaidParcelFate {
  const payment = payable.payment;
  const refundAsked = payment?.refundRequestedAt != null;
  return {
    endedWithoutDelivery: ENDED_WITHOUT_DELIVERY.has(payable.status),
    heldForTeam:
      payment?.refundHeldAt != null || (payable.cancelledByResellerAfterAccept && !refundAsked),
    moneyReleased:
      payment?.releasedAt != null ||
      payment?.escrowStatus === "done" ||
      payment?.teamDecision === "release",
  };
}

/** The payment badge of each parcel of one supplier, for its order list. */
export async function supplierPaymentBadges(input: {
  supplierId: string;
  shipmentIds: readonly string[];
}): Promise<Map<string, SupplierPaymentBadge>> {
  const [summaries, accounts] = await Promise.all([
    listShipmentPaymentSummaries(database, input.shipmentIds),
    receivingAccountsOf(input.supplierId),
  ]);
  const linked = accounts.receiving.provider !== null;
  return new Map(input.shipmentIds.map((id) => [id, badgeFor(summaries.get(id), linked)]));
}

const IN_REVIEW_MESSAGE =
  "O pagamento está em análise no Mercado Pago. Assim que ele confirmar, aparece aqui.";
const ASAAS_IN_REVIEW_MESSAGE =
  "O pagamento está em análise no Asaas. Assim que ele confirmar, aparece aqui.";

function inReviewMessage(provider: PaymentProviderName | undefined): string {
  return provider === "asaas" ? ASAAS_IN_REVIEW_MESSAGE : IN_REVIEW_MESSAGE;
}
const ALREADY_PAID_MESSAGE = "Este envio já foi pago. O valor está na conta do fornecedor.";
const ALREADY_PAID_PROTECTED_MESSAGE = "Este envio já foi pago. O valor está protegido no Asaas.";

/** Asaas holds the money until the delivery: it is not in the supplier's account yet. */
function alreadyPaidMessage(provider: PaymentProviderName | undefined): string {
  return provider === "asaas" ? ALREADY_PAID_PROTECTED_MESSAGE : ALREADY_PAID_MESSAGE;
}
const UNCHECKED_MESSAGE =
  "Não conseguimos conferir com o Mercado Pago agora. Tente de novo em alguns minutos.";

const NO_ACCOUNT_MESSAGE =
  "Este fornecedor ainda não ligou a conta de recebimento no Asaas. Assim que ligar, o pagamento aparece aqui.";

/** Why the reseller cannot pay this parcel here, or null when it can. */
function checkoutRefusal(payable: PayableShipment, linked: boolean): string | null {
  if (payable.catalogKind === "seller") {
    return "Este envio é do seu próprio estoque: não há fornecedor para pagar.";
  }
  if (SETTLED_FULFILLMENT_STATUSES.includes(payable.status)) {
    return "Este envio já foi encerrado: não dá mais para pagar por aqui.";
  }
  if (payable.payment?.status === "in_process") {
    return inReviewMessage(payable.payment.provider);
  }
  if (payable.amountCents <= 0) {
    return "Este pedido não tem o valor do fornecedor. Fale com o suporte para acertar o valor.";
  }
  if (!linked) {
    return NO_ACCOUNT_MESSAGE;
  }
  return null;
}

/**
 * A refund Asaas refused is made by the team by hand, and the reseller asks for it through a
 * support ticket: the order to open it about, the ticket already open on it, and the day Asaas
 * stops holding the money. Null for every other payment.
 */
async function manualRefundView(tenantId: string, payable: PayableShipment) {
  const { payment } = payable;
  if (payment?.provider !== "asaas" || payment.status !== "approved") {
    return null;
  }
  if (payment.refundFailedAt === null) {
    return null;
  }
  const ticketId = await findOpenSupportTicketForOrder(database, {
    tenantId,
    orderId: payable.orderId,
  });
  const now = new Date();
  const askUntil = manualRefundLastMoment(payment);
  return {
    orderId: payable.orderId,
    orderName: payable.externalOrderId,
    ticketId,
    // Only a guarantee Asaas reported has a day the money leaves; without one there is no date.
    askUntil: askUntil?.toISOString() ?? null,
    /** Asaas already released the money to the supplier: it is no longer protected. */
    releasedToSupplier: askUntil !== null && now.getTime() > askUntil.getTime(),
  };
}

/**
 * Why SellBridge gave (or is giving) the reseller's money back, and whether the provider refused.
 * A paid parcel that was cancelled or came back is owed back even before the refund round asks.
 */
function refundView(payable: PayableShipment, badge: SupplierPaymentBadge) {
  const { payment } = payable;
  if (payment?.refundRequestedAt != null) {
    return { reason: payment.refundReason, failed: payment.refundFailedAt !== null };
  }
  if (badge.kind !== "refunding") {
    return null;
  }
  return {
    reason: payable.status === "returned" ? "returned" : "cancelled",
    failed: false,
  } as const;
}

const SETTLED_BADGES: ReadonlySet<SupplierPaymentBadge["kind"]> = new Set([
  "paid",
  "held",
  "refunding",
  "refunded",
]);

/** What was paid once the payment settled (an older checkout may have charged another amount). */
function shownAmountCents(payable: PayableShipment, badge: SupplierPaymentBadge): number {
  if (payable.payment !== null && SETTLED_BADGES.has(badge.kind)) {
    return payable.payment.amountCents;
  }
  return payable.amountCents;
}

/** What the reseller sees about paying the supplier of one parcel. */
export async function loadResellerSupplierPayment(input: { tenantId: string; shipmentId: string }) {
  const payable = await findPayableShipment(database, input);
  if (payable === null) {
    throw notFoundError("Envio não encontrado.");
  }
  const accounts = await receivingAccountsOf(payable.supplierId);
  const provider = providerOfParcel(payable, accounts);
  const linked = provider !== null;
  const summary =
    payable.payment === null
      ? undefined
      : {
          status: payable.payment.status,
          paidAt: payable.payment.paidAt,
          paymentMethod: payable.payment.paymentMethod,
          refundRequestedAt: payable.payment.refundRequestedAt,
        };
  const fate = parcelFate(payable);
  const badge = badgeFor(summary, linked, fate);
  const refusal = checkoutRefusal(payable, linked);
  const [preparationHold, manualRefund] = await Promise.all([
    findPreparationHold(database, input.shipmentId),
    manualRefundView(input.tenantId, payable),
  ]);
  return {
    /** The team gives this payment back by hand; the reseller asks through a ticket. */
    manualRefund,
    /** Why the supplier may not prepare the parcel yet; null when it may. */
    preparationHold,
    amountCents: shownAmountCents(payable, badge),
    badge,
    canPay: badge.kind === "waiting" && refusal === null,
    refusal,
    refund: refundView(payable, badge),
    /** How the reseller paid ("PIX", "CREDIT_CARD"…), which says how the money comes back. */
    paymentMethod: payable.payment?.paymentMethod ?? null,
    /** The money already went to the supplier: nothing is held for the reseller any more. */
    moneyReleased: fate.moneyReleased,
    /** Held until delivery (Asaas): the reseller sees the protection seal. */
    protectedPayment: provider === "asaas",
    provider,
    /** Why the cancelled parcel cannot go back to its supplier; null when it can, or is not cancelled. */
    reforwardBlock: payable.status === "cancelled" ? reforwardBlockFor(payable.payment) : null,
  };
}

/** Payments that already moved (or are moving) stay on the provider they started on. */
const STARTED_STATUSES: readonly ShipmentPayment["status"][] = [
  "in_process",
  "approved",
  "refunded",
  "charged_back",
];

/**
 * The provider of the parcel's payment when it started or its checkout is still open, else the
 * one the supplier receives through now (its choice, or the admin rule for new suppliers).
 */
function providerOfParcel(
  payable: PayableShipment,
  accounts: ReceivingAccounts,
): PaymentProviderName | null {
  const { payment } = payable;
  if (payment !== null && STARTED_STATUSES.includes(payment.status)) {
    return payment.provider;
  }
  if (payment !== null && openCheckoutUrl(payment, new Date()) !== null) {
    return payment.provider;
  }
  return accounts.receiving.provider;
}

function orderPageUrl(orderId: string, shipmentId: string): string {
  const url = new URL(`/pedidos/${orderId}`, environment.APP_URL);
  url.searchParams.set("envio", shipmentId);
  return url.toString();
}

/** The parcel, the provider it is paid through and that provider's account, or why not here. */
async function payableWithAccount(input: { tenantId: string; shipmentId: string }) {
  const payable = await findPayableShipment(database, input);
  if (payable === null) {
    throw notFoundError("Envio não encontrado.");
  }
  const accounts = await receivingAccountsOf(payable.supplierId);
  const provider = providerOfParcel(payable, accounts);
  const account = provider === "asaas" ? accounts.asaas : accounts.mercadoPago;
  const refusal = checkoutRefusal(payable, provider !== null && account?.status === "connected");
  if (refusal !== null || account === null || provider === null) {
    throw validationError(refusal ?? NO_ACCOUNT_MESSAGE);
  }
  return { payable, account, provider, accounts };
}

const RELINK_MESSAGE =
  "A conta de recebimento deste fornecedor precisa ser ligada de novo. Assim que ele ligar, o pagamento aparece aqui.";

/** Long enough to create the preference; a failed attempt frees the parcel right away. */
const CHECKOUT_RESERVATION_IN_MS = 60_000;

/** Why no new checkout was opened, after another request or a payment got there first. */
async function refusedCheckout(shipmentId: string): Promise<{ checkoutUrl: string }> {
  const current = await findShipmentPayment(database, shipmentId);
  const open = openCheckoutUrl(current, new Date());
  if (open !== null) {
    return { checkoutUrl: open };
  }
  if (current?.status === "pending") {
    throw validationError("O pagamento já está sendo aberto. Tente de novo em alguns segundos.");
  }
  if (current?.status === "in_process") {
    throw validationError(inReviewMessage(current.provider));
  }
  throw validationError(alreadyPaidMessage(current?.provider));
}

/**
 * Before a new checkout, asks Mercado Pago about every payment of the parcel's earlier ones and
 * records them: one under review or approved blocks the new checkout, a rejected one frees it.
 * When Mercado Pago cannot answer, no new checkout opens, so a payment is never made twice.
 */
async function settleEarlierCheckouts(
  context: MercadoPagoContext,
  account: SupplierPaymentAccount,
  payment: ShipmentPayment,
): Promise<void> {
  const settled = await reconcileBeforeCheckout(context, account, payment);
  if (settled?.status === "in_process") {
    throw validationError(inReviewMessage(payment.provider));
  }
  if (settled?.status === "approved") {
    throw validationError(ALREADY_PAID_MESSAGE);
  }
}

async function reconcileBeforeCheckout(
  context: MercadoPagoContext,
  account: SupplierPaymentAccount,
  payment: ShipmentPayment,
): Promise<ShipmentPayment | null> {
  try {
    return await reconcileShipmentPayment(context, { account, payment });
  } catch (error) {
    if (error instanceof PaymentAccountUnavailableError) {
      throw validationError(RELINK_MESSAGE);
    }
    if (isMercadoPagoError(error)) {
      logger.warn("mercado_pago.earlier_checkouts_unchecked", {
        shipmentPaymentId: payment.id,
        error,
      });
      throw validationError(UNCHECKED_MESSAGE);
    }
    throw error;
  }
}

/** The preference, created with the supplier's token; a failure frees the reserved parcel. */
async function createCheckout(
  context: MercadoPagoContext,
  account: SupplierPaymentAccount,
  input: { paymentId: string; checkout: Omit<CheckoutRequest, "externalReference"> },
) {
  try {
    const accessToken = await supplierAccessToken(context, account);
    return await withSupplierAccount(context, account, async () =>
      createMercadoPagoCheckout(context.settings, {
        accessToken,
        checkout: { ...input.checkout, externalReference: input.paymentId },
      }),
    );
  } catch (error) {
    await releaseShipmentPaymentReservation(database, input.paymentId);
    if (error instanceof PaymentAccountUnavailableError) {
      throw validationError(RELINK_MESSAGE);
    }
    throw error;
  }
}

/**
 * Starts the checkout for a parcel, in the supplier's account, with SellBridge's fee. On Asaas the
 * charge asks only the method the reseller picked; the hidden Mercado Pago path ignores it.
 *
 * @throws When the parcel cannot be paid here (see `checkoutRefusal`) or is already paid.
 */
export async function startSupplierCheckout(input: {
  tenantId: string;
  shipmentId: string;
  payMethod: SupplierPayMethod;
  impersonatedBy: string | null;
}): Promise<{ checkoutUrl: string }> {
  if (input.impersonatedBy !== null) {
    throw validationError("Durante a visita da equipe não dá para pagar o fornecedor.");
  }
  const { payable, account, provider, accounts } = await payableWithAccount(input);
  const payment = payable.payment;
  const open = openCheckoutUrl(payment, new Date());
  const reopensAsaasCharge = provider === "asaas" && payment?.provider === "asaas";
  if (open !== null && !reopensAsaasCharge) {
    return { checkoutUrl: open };
  }
  if (open !== null && payment !== null && payment.preferenceId !== null) {
    // The open charge may ask for the other method: its charges are listed again and the one
    // asking for the picked method is reused, or opened.
    await reopenShipmentCheckout(database, {
      paymentId: payment.id,
      preferenceId: payment.preferenceId,
    });
  }
  await settleEarlierAttempts(payment, accounts);
  if (provider === "asaas") {
    return openNewAsaasCheckout({
      tenantId: input.tenantId,
      payable,
      account,
      payMethod: input.payMethod,
    });
  }
  const context = mercadoPagoContext();
  if (context === null) {
    throw validationError("O pagamento pelo Mercado Pago ainda não está disponível.");
  }
  return openNewCheckout(context, { payable, account });
}

/**
 * Before any new checkout, the parcel's earlier attempts are read back on the provider they were
 * made on (the supplier may have switched since): a paid or reviewed one blocks the new checkout.
 */
async function settleEarlierAttempts(
  payment: ShipmentPayment | null,
  accounts: ReceivingAccounts,
): Promise<void> {
  if (payment === null) {
    return;
  }
  if (payment.provider === "asaas") {
    // Asaas charges are listed again when the next one opens; leaving Asaas closes them here.
    if (accounts.receiving.provider !== "asaas") {
      await leaveAsaasCharges({ account: accounts.asaas, payment });
    }
    return;
  }
  if (payment.preferenceId === null) {
    return;
  }
  const context = mercadoPagoContext();
  if (context === null || accounts.mercadoPago === null) {
    throw validationError(UNCHECKED_MESSAGE);
  }
  await settleEarlierCheckouts(context, accounts.mercadoPago, payment);
}

/** Reserves the parcel for Asaas and opens (or reuses) its charge in the supplier's account. */
async function openNewAsaasCheckout(input: {
  tenantId: string;
  payable: PayableShipment;
  account: SupplierPaymentAccount;
  payMethod: SupplierPayMethod;
}): Promise<{ checkoutUrl: string }> {
  const payment = await reserveParcel(input.payable, "asaas");
  if (payment === null) {
    return refusedCheckout(input.payable.shipmentId);
  }
  const successUrl = new URL(orderPageUrl(input.payable.orderId, input.payable.shipmentId));
  successUrl.searchParams.set("pagamento", "asaas");
  return openAsaasCheckout({
    tenantId: input.tenantId,
    payable: input.payable,
    account: input.account,
    payment,
    payMethod: input.payMethod,
    successUrl: successUrl.toString(),
  });
}

/** Reserving the parcel makes a second click or tab wait instead of opening another checkout. */
async function reserveParcel(
  payable: PayableShipment,
  provider: PaymentProviderName,
): Promise<ShipmentPayment | null> {
  const now = new Date();
  return startShipmentPayment(database, {
    shipmentId: payable.shipmentId,
    supplierId: payable.supplierId,
    provider,
    amountCents: payable.amountCents,
    platformFeeCents: platformFeeCents(payable.amountCents, PAYMENT_FEE_BASIS_POINTS),
    platformFeeBasisPoints: PAYMENT_FEE_BASIS_POINTS,
    now,
    reservedUntil: new Date(now.getTime() + CHECKOUT_RESERVATION_IN_MS),
  });
}

/** The reseller is back from Asaas's page: its charges are read back before showing the badge. */
export async function confirmAsaasPaymentReturn(input: { tenantId: string; shipmentId: string }) {
  const payable = await findPayableShipment(database, input);
  if (payable === null) {
    throw notFoundError("Envio não encontrado.");
  }
  const accounts = await receivingAccountsOf(payable.supplierId);
  await refreshAsaasParcel({ ...input, account: accounts.asaas });
  return loadResellerSupplierPayment(input);
}

/** Reserves the parcel, creates its checkout with the supplier's token and keeps it. */
async function openNewCheckout(
  context: MercadoPagoContext,
  input: { payable: PayableShipment; account: SupplierPaymentAccount },
): Promise<{ checkoutUrl: string }> {
  const { payable, account } = input;
  const payment = await reserveParcel(payable, PROVIDER);
  if (payment === null) {
    return refusedCheckout(payable.shipmentId);
  }
  const expiresAt = new Date(Date.now() + CHECKOUT_TTL_IN_MS);
  const checkout = await createCheckout(context, account, {
    paymentId: payment.id,
    checkout: {
      title: `Pedido ${payable.externalOrderId} · ${payable.supplierName}`,
      amountCents: payment.amountCents,
      platformFeeCents: payment.platformFeeCents,
      returnUrl: orderPageUrl(payable.orderId, payable.shipmentId),
      notificationUrl: mercadoPagoNotificationUrl(),
      expiresAt,
    },
  });
  await saveOpenedCheckout(payment, { ...checkout, expiresAt });
  return { checkoutUrl: checkout.checkoutUrl };
}

/** Keeps the checkout as the parcel's open one and in its history, with what it charges. */
async function saveOpenedCheckout(
  payment: ShipmentPayment,
  checkout: { preferenceId: string; checkoutUrl: string; expiresAt: Date },
): Promise<void> {
  await savePaymentPreference(database, {
    paymentId: payment.id,
    preferenceId: checkout.preferenceId,
    checkoutUrl: checkout.checkoutUrl,
    checkoutExpiresAt: checkout.expiresAt,
    amountCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
  });
  logger.info("mercado_pago.checkout_started", {
    shipmentPaymentId: payment.id,
    amountCents: payment.amountCents,
    platformFeeCents: payment.platformFeeCents,
  });
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
  const context = mercadoPagoContext();
  const payable = await findPayableShipment(database, input);
  if (payable === null) {
    throw notFoundError("Envio não encontrado.");
  }
  if (context === null || payable.payment === null) {
    return loadResellerSupplierPayment(input);
  }
  const account = await findSupplierPaymentAccount(database, {
    supplierId: payable.supplierId,
    provider: PROVIDER,
  });
  if (account !== null && account.status === "connected") {
    const result = await syncMercadoPagoPayment(context, {
      account,
      providerPaymentId: input.providerPaymentId,
      expectedPaymentId: payable.payment.id,
    });
    if (result.kind === "ignored") {
      logger.warn("mercado_pago.return_ignored", { reason: result.reason });
    }
  }
  return loadResellerSupplierPayment(input);
}
