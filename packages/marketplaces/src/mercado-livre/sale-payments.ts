import { z } from "zod";
import type { StoreCredentials } from "../types.ts";
import { marketplaceError } from "../errors.ts";
import { requestJson, type MercadoLivreConfig } from "./client.ts";
import { externalIdSchema } from "./schemas.ts";

/**
 * What the reseller's sale note needs from the order besides the buyer's document: the approved
 * payments, with each card's authorization code (NT 2025.001). Read from `GET /orders/{id}`; never logged or stored.
 */

const orderPaymentsSchema = z.object({
  seller: z.object({ id: externalIdSchema }),
  payments: z
    .array(
      z.object({
        status: z.string().nullish(),
        payment_type: z.string().nullish(),
        payment_method_id: z.string().nullish(),
        authorization_code: z.string().nullish(),
        transaction_amount: z.number().nullish(),
      }),
    )
    .nullish(),
});

export interface MercadoLivreApprovedPayment {
  /** `payment_type`: credit_card, debit_card, account_money, ticket, bank_transfer… */
  readonly type: string;
  /** `payment_method_id`: visa, master, pix… */
  readonly methodId: string;
  /** The card's authorization code; null for anything else or when the order sent none. */
  readonly authorizationCode: string | null;
  readonly amountCents: number;
}

export interface MercadoLivreSalePayments {
  readonly payments: readonly MercadoLivreApprovedPayment[];
}

const APPROVED = "approved";

function presentText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

function toCents(amount: number | null | undefined): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return Math.round(amount * 100);
}

/**
 * The order's approved payments.
 *
 * @throws {AppError} EXTERNAL_PROVIDER, not retryable, when the order number is not numeric or the
 * order belongs to another seller.
 */
export async function readMercadoLivreSalePayments(
  config: MercadoLivreConfig,
  store: StoreCredentials,
  orderId: string,
): Promise<MercadoLivreSalePayments> {
  if (!/^\d+$/.test(orderId)) {
    throw marketplaceError("Número de pedido inválido", { retryable: false });
  }
  const context = {
    config,
    fetchImplementation: config.fetchImplementation ?? fetch,
    now: config.now ?? (() => new Date()),
  };
  const order = await requestJson(context, {
    schema: orderPaymentsSchema,
    path: `/orders/${orderId}`,
    init: { accessToken: store.accessToken },
  });
  if (String(order.seller.id) !== store.externalShopId) {
    throw marketplaceError("Pedido não pertence à loja conectada", { retryable: false });
  }
  const payments: MercadoLivreApprovedPayment[] = [];
  for (const payment of order.payments ?? []) {
    const amountCents = toCents(payment.transaction_amount);
    const type = presentText(payment.payment_type);
    const methodId = presentText(payment.payment_method_id);
    if (payment.status !== APPROVED || amountCents === null || type === null || methodId === null) {
      continue;
    }
    payments.push({
      type,
      methodId,
      authorizationCode: presentText(payment.authorization_code),
      amountCents,
    });
  }
  return { payments };
}
