import { formatCents } from "@sellbridge/shared/money";
import type { SupplierPaymentBadge } from "@sellbridge/shared/shipment-payments";
import type { FulfillmentStatus } from "@sellbridge/shared/schemas";
import { CARD_METHODS, CARD_REFUND_TIMING, PIX_METHODS } from "./refund-copy";

/** Steps that mean the supplier took the parcel on: cancelling then leaves the money to the team. */
const ACCEPTED_STATUSES: ReadonlySet<FulfillmentStatus> = new Set(["accepted", "picking", "ready"]);

/**
 * What happens to the money if the reseller cancels this parcel now, said before the click:
 * nothing to say while it is not paid. Null then.
 */
export function cancelMoneyNote(input: {
  badge: SupplierPaymentBadge;
  amountCents: number;
  paymentMethod: string | null;
  /** The gateway the payment went through; only Asaas gives a Pix back on its own. */
  provider: string | null;
  parcelStatus: FulfillmentStatus;
}): string | null {
  if (input.badge.kind !== "paid") {
    return null;
  }
  const amount = formatCents(input.amountCents);
  if (ACCEPTED_STATUSES.has(input.parcelStatus)) {
    return `O fornecedor já aceitou este pedido, então os ${amount} pagos a ele não voltam na hora: a equipe do SellBridge confere com ele se o produto já foi postado e, se não foi, devolve o valor para você.`;
  }
  if (input.paymentMethod !== null && CARD_METHODS.has(input.paymentMethod)) {
    return `Os ${amount} pagos ao fornecedor voltam para o seu cartão. ${CARD_REFUND_TIMING}`;
  }
  const pix = input.paymentMethod !== null && PIX_METHODS.has(input.paymentMethod);
  if (pix && input.provider === "asaas") {
    return `Os ${amount} pagos ao fornecedor voltam para você por Pix, pelo Asaas. Se o Asaas não devolver sozinho, a equipe do SellBridge cuida da devolução.`;
  }
  return `Os ${amount} pagos ao fornecedor voltam para você.`;
}
