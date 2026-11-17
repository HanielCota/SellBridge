import {
  markShipmentPaymentRefundFailed,
  requestShipmentPaymentRefund,
  setAdminSupplierActive,
  type ShipmentPayment,
  type SupplierPaymentAccount,
} from "@sellbridge/database/repositories";
import { logger } from "@sellbridge/shared/logger";
import { formatCents } from "@sellbridge/shared/money";
import type { ShipmentPaymentRefundReason } from "@sellbridge/shared/shipment-payments";
import {
  PaymentAccountUnavailableError,
  supplierAccessToken,
  withSupplierAccount,
} from "./account-access.ts";
import { isMercadoPagoError, refundMercadoPagoPayment } from "./client.ts";
import type { MercadoPagoContext } from "./context.ts";
import { syncMercadoPagoPayment } from "./payment-sync.ts";

/** What asking for a refund did. */
export type RefundOutcome =
  /** The parcel is no longer paid (refunded meanwhile) or its refund already failed. */
  | { kind: "skipped" }
  /** Mercado Pago took the refund; the parcel shows it once Mercado Pago reports it refunded. */
  | { kind: "requested"; payment: ShipmentPayment }
  /** Mercado Pago could not be reached: the next round asks again, with the same key. */
  | { kind: "retry" }
  /** Mercado Pago refused for good: the supplier is blocked and the team alerted, once. */
  | { kind: "refused"; reason: string; supplierBlocked: boolean };

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

/**
 * Why a failed refund will not work by asking again, or null when it may (Mercado Pago
 * unreachable, busy or failing on its side). An unlinked or refused account counts as a refusal:
 * without it, SellBridge cannot take the money back.
 */
function definitiveRefusal(error: unknown): string | null {
  if (error instanceof PaymentAccountUnavailableError) {
    return "account_unavailable";
  }
  if (!isMercadoPagoError(error)) {
    throw error;
  }
  if (error.status === null || error.status === TOO_MANY_REQUESTS) {
    return null;
  }
  if (error.status >= SERVER_ERROR) {
    return null;
  }
  return error.reason ?? `http_${error.status}`;
}

export interface RefundInput {
  /** The supplier's linked account; null or unlinked means the refund cannot be made. */
  account: SupplierPaymentAccount | null;
  payment: ShipmentPayment;
  reason: ShipmentPaymentRefundReason;
  /** The reseller's tenant and order, so the team sees whose money it is. */
  tenantId: string;
  orderId: string;
  now: Date;
}

async function askMercadoPagoToRefund(
  context: MercadoPagoContext,
  input: { account: SupplierPaymentAccount | null; payment: ShipmentPayment },
): Promise<void> {
  const { account, payment } = input;
  if (account === null) {
    throw new PaymentAccountUnavailableError(`Supplier ${payment.supplierId} has no account`);
  }
  const paymentId = payment.providerPaymentId;
  if (paymentId === null) {
    throw new Error(`Paid parcel payment ${payment.id} has no provider payment`);
  }
  const accessToken = await supplierAccessToken(context, account);
  await withSupplierAccount(context, account, async () =>
    refundMercadoPagoPayment(context.settings, {
      accessToken,
      paymentId,
      idempotencyKey: `refund-${payment.id}`,
    }),
  );
}

/** Blocks the supplier and alerts the team, the first time this refund is refused. */
async function refuseRefund(
  context: MercadoPagoContext,
  input: RefundInput & { payment: ShipmentPayment },
  refusal: string,
): Promise<RefundOutcome> {
  const { payment } = input;
  const firstTime = await markShipmentPaymentRefundFailed(context.database, {
    paymentId: payment.id,
    error: refusal,
    now: input.now,
  });
  if (!firstTime) {
    return { kind: "refused", reason: refusal, supplierBlocked: false };
  }
  await setAdminSupplierActive(context.database, payment.supplierId, false);
  logger.error("mercado_pago.refund_refused", {
    reason: `Devolução de ${formatCents(payment.amountCents)} recusada pelo Mercado Pago: o fornecedor foi desativado. Devolva o valor ao revendedor por fora.`,
    problemKey: payment.id,
    shipmentPaymentId: payment.id,
    supplierId: payment.supplierId,
    tenantId: input.tenantId,
    orderId: input.orderId,
    refundReason: input.reason,
    providerRefusal: refusal,
  });
  return { kind: "refused", reason: refusal, supplierBlocked: true };
}

/**
 * Gives the reseller's money for a parcel back through Mercado Pago, with the supplier's token,
 * and records the result. Asking again for the same parcel (after Mercado Pago was unreachable)
 * never refunds twice: the request carries the same idempotency key. When Mercado Pago refuses
 * for good (no balance in the supplier's account, an unlinked account), the supplier is
 * deactivated and the refusal goes to the team's Problemas page.
 */
export async function refundShipmentPayment(
  context: MercadoPagoContext,
  input: RefundInput,
): Promise<RefundOutcome> {
  const requested = await requestShipmentPaymentRefund(context.database, {
    paymentId: input.payment.id,
    reason: input.reason,
    now: input.now,
  });
  if (requested === null) {
    return { kind: "skipped" };
  }
  try {
    await askMercadoPagoToRefund(context, { account: input.account, payment: requested });
  } catch (error) {
    const refusal = definitiveRefusal(error);
    if (refusal === null) {
      logger.warn("mercado_pago.refund_deferred", { shipmentPaymentId: requested.id, error });
      return { kind: "retry" };
    }
    return refuseRefund(context, { ...input, payment: requested }, refusal);
  }
  logger.info("mercado_pago.refund_requested", {
    shipmentPaymentId: requested.id,
    reason: requested.refundReason,
  });
  if (input.account === null || requested.providerPaymentId === null) {
    return { kind: "requested", payment: requested };
  }
  const synced = await syncMercadoPagoPayment(context, {
    account: input.account,
    providerPaymentId: requested.providerPaymentId,
  });
  return { kind: "requested", payment: synced.kind === "applied" ? synced.payment : requested };
}
