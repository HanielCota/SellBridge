import type { Database } from "@sellbridge/database";
import {
  findSupplierPaymentAccount,
  holdShipmentPaymentRefund,
  listShipmentPaymentRefundCandidates,
  listShipmentPaymentsToReconcile,
  markShipmentPaymentChecked,
  type RefundCandidate,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import {
  isMercadoPagoError,
  PaymentAccountUnavailableError,
  reconcileShipmentPayment,
  refundShipmentPayment,
  type MercadoPagoContext,
  type MercadoPagoSettings,
} from "@sellbridge/payments/mercado-pago";
import { logger } from "@sellbridge/shared/logger";
import { formatCents } from "@sellbridge/shared/money";
import { supplierPaymentRefundReason } from "@sellbridge/shared/shipment-payments";
import type { TokenCipher } from "@sellbridge/shared/token-cipher";
import { type PaymentDeferrals, trackPaymentDeferrals } from "./payment-deferrals.ts";

/** Unpaid checkouts are read back for three days after they close; under review, until settled. */
export const RECHECK_UNPAID_FOR_IN_MS = 3 * 24 * 60 * 60 * 1000;
/** Parcels read per round, each list; the rest wait for the next round, five minutes later. */
export const SUPPLIER_PAYMENT_BATCH = 100;

export interface SupplierPaymentDependencies {
  readonly database: Database;
  readonly cipher: TokenCipher;
  /** Null while paying suppliers through Mercado Pago is off: the job then does nothing. */
  readonly settings: MercadoPagoSettings | null;
  /** Asks for a stock sync, so a blocked supplier's listings go to zero right away. */
  readonly requestStockSync: () => Promise<void>;
  readonly now?: () => Date;
}

export interface SupplierPaymentRound {
  checked: number;
  refundsRequested: number;
  refundsRefused: number;
  /** Cancelled by the reseller after the supplier accepted: left to the team, not refunded. */
  refundsHeld: number;
}

/** Each supplier's linked account, read once per round. */
function accountLoader(database: Database) {
  const accounts = new Map<string, Promise<SupplierPaymentAccount | null>>();
  return async (supplierId: string): Promise<SupplierPaymentAccount | null> => {
    const cached = accounts.get(supplierId);
    if (cached !== undefined) {
      return cached;
    }
    const loading = findSupplierPaymentAccount(database, { supplierId, provider: "mercado_pago" });
    accounts.set(supplierId, loading);
    return loading;
  };
}

type LoadAccount = ReturnType<typeof accountLoader>;

async function reconcileOne(
  context: MercadoPagoContext,
  input: {
    payment: ShipmentPayment;
    loadAccount: LoadAccount;
    now: Date;
    deferrals: PaymentDeferrals;
  },
): Promise<void> {
  const { payment } = input;
  // Marked first: a payment that keeps failing still gives way to the others next round.
  await markShipmentPaymentChecked(context.database, { paymentId: payment.id, now: input.now });
  const account = await input.loadAccount(payment.supplierId);
  if (account?.status !== "connected") {
    return;
  }
  try {
    await reconcileShipmentPayment(context, { account, payment });
  } catch (error) {
    if (isMercadoPagoError(error) || error instanceof PaymentAccountUnavailableError) {
      await input.deferrals.deferred("mercado_pago.reconcile_deferred", payment.id, error);
      return;
    }
    throw error;
  }
  await input.deferrals.reached(payment.id);
}

/**
 * Reads back from Mercado Pago every parcel payment a notice may have missed, so a lost notice
 * never leaves a parcel looking unpaid (or paid). Nobody has to remember what they paid.
 */
async function reconcileOpenPayments(
  context: MercadoPagoContext,
  input: { loadAccount: LoadAccount; now: Date; deferrals: PaymentDeferrals },
): Promise<number> {
  const payments = await listShipmentPaymentsToReconcile(context.database, {
    provider: "mercado_pago",
    now: input.now,
    recheckForInMs: RECHECK_UNPAID_FOR_IN_MS,
    limit: SUPPLIER_PAYMENT_BATCH,
  });
  // One at a time: Mercado Pago limits how often SellBridge may call it.
  for (const payment of payments) {
    await reconcileOne(context, { ...input, payment });
  }
  return payments.length;
}

function refundReasonOf(candidate: RefundCandidate, now: Date) {
  const { payment } = candidate;
  if (payment.refundReason !== null) {
    return payment.refundReason;
  }
  const paidAt = payment.paidAt ?? payment.updatedAt;
  return supplierPaymentRefundReason({ timing: candidate.timing, paidAt, now });
}

/**
 * The reseller cancelled after the supplier accepted, and no refund was asked for yet: the
 * supplier may have posted the parcel, so the team checks before any money goes back.
 */
function leftToTheTeam(candidate: RefundCandidate): boolean {
  return candidate.cancelledByResellerAfterAccept && candidate.payment.refundRequestedAt === null;
}

/** Holds the parcel's money and alerts the team on Problemas, the first time only. */
async function holdForTheTeam(
  database: Database,
  input: { candidate: RefundCandidate; now: Date },
): Promise<boolean> {
  const { payment } = input.candidate;
  const firstTime = await holdShipmentPaymentRefund(database, {
    paymentId: payment.id,
    now: input.now,
  });
  if (!firstTime) {
    return false;
  }
  logger.error("mercado_pago.refund_held", {
    reason: `Envio do pedido ${input.candidate.orderNumber} cancelado pelo revendedor depois que o fornecedor aceitou (${formatCents(payment.amountCents)} pagos ao fornecedor). Confira com o fornecedor se ele já postou; se não postou, devolva o valor ao revendedor à mão no Mercado Pago.`,
    problemKey: payment.id,
    shipmentPaymentId: payment.id,
    shipmentId: payment.shipmentId,
    supplierId: payment.supplierId,
    tenantId: input.candidate.tenantId,
    orderId: input.candidate.orderId,
  });
  return true;
}

/**
 * Gives the reseller's money back for paid parcels the supplier did not ship in time, or that
 * were cancelled or came back. A refused refund deactivates the supplier. A parcel the reseller
 * cancelled after the supplier accepted is left to the team instead.
 */
async function refundDuePayments(
  context: MercadoPagoContext,
  input: { loadAccount: LoadAccount; now: Date; requestStockSync: () => Promise<void> },
): Promise<Omit<SupplierPaymentRound, "checked">> {
  const candidates = await listShipmentPaymentRefundCandidates(context.database, {
    provider: "mercado_pago",
    limit: SUPPLIER_PAYMENT_BATCH,
  });
  const round = { refundsRequested: 0, refundsRefused: 0, refundsHeld: 0 };
  for (const candidate of candidates) {
    if (leftToTheTeam(candidate)) {
      const held = await holdForTheTeam(context.database, { candidate, now: input.now });
      round.refundsHeld += held ? 1 : 0;
      continue;
    }
    const reason = refundReasonOf(candidate, input.now);
    if (reason === null) {
      continue;
    }
    const outcome = await refundShipmentPayment(context, {
      account: await input.loadAccount(candidate.payment.supplierId),
      payment: candidate.payment,
      reason,
      tenantId: candidate.tenantId,
      orderId: candidate.orderId,
      now: input.now,
    });
    if (outcome.kind === "requested") {
      round.refundsRequested += 1;
    }
    if (outcome.kind === "refused" && outcome.supplierBlocked) {
      round.refundsRefused += 1;
      await input.requestStockSync();
    }
  }
  return round;
}

/**
 * Every few minutes: reads back the open supplier payments, then refunds the ones that are due.
 */
export function createSupplierPaymentProcessor(dependencies: SupplierPaymentDependencies) {
  return async function processSupplierPayments(): Promise<SupplierPaymentRound> {
    const { settings } = dependencies;
    if (settings === null) {
      return { checked: 0, refundsRequested: 0, refundsRefused: 0, refundsHeld: 0 };
    }
    const context = { database: dependencies.database, cipher: dependencies.cipher, settings };
    const now = dependencies.now?.() ?? new Date();
    const loadAccount = accountLoader(dependencies.database);
    const deferrals = trackPaymentDeferrals(context.database, { provider: "mercado_pago", now });
    const checked = await reconcileOpenPayments(context, { loadAccount, now, deferrals });
    deferrals.report();
    const refunds = await refundDuePayments(context, {
      loadAccount,
      now,
      requestStockSync: dependencies.requestStockSync,
    });
    const round = { checked, ...refunds };
    const anyRefund = refunds.refundsRequested + refunds.refundsRefused + refunds.refundsHeld > 0;
    if (checked > 0 || anyRefund) {
      logger.info("mercado_pago.supplier_payments_round", round);
    }
    return round;
  };
}
