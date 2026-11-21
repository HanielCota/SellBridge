import { formatCents } from "@sellbridge/shared/money";
import type { SupplierPaymentBadge } from "@sellbridge/shared/shipment-payments";
import { CARD_REFUND_TIMING } from "./refund-copy";

/** Steps that mean the supplier took the parcel on: cancelling then leaves the money to the team. */
const ACCEPTED_STATUSES: ReadonlySet<string> = new Set(["accepted", "picking", "ready"]);

/**
 * What happens to the money if the reseller cancels this parcel now, said before the click:
 * nothing to say while it is not paid. Null then.
 */
export function cancelMoneyNote(input: {
  badge: SupplierPaymentBadge;
  amountCents: number;
  paymentMethod: string | null;
  parcelStatus: string;
}): string | null {
  if (input.badge.kind !== "paid") {
    return null;
  }
  const amount = formatCents(input.amountCents);
  if (ACCEPTED_STATUSES.has(input.parcelStatus)) {
    return `O fornecedor já aceitou este pedido, então os ${amount} pagos a ele não voltam na hora: a equipe do SellBridge confere com ele se o produto já foi postado e, se não foi, devolve o valor para você.`;
  }
  if (input.paymentMethod === "CREDIT_CARD") {
    return `Os ${amount} pagos ao fornecedor voltam para o seu cartão. ${CARD_REFUND_TIMING}`;
  }
  if (input.paymentMethod === "PIX") {
    return `Os ${amount} pagos ao fornecedor voltam para você por Pix, pelo Asaas. Se o Asaas não devolver sozinho, a equipe do SellBridge devolve, e o pedido mostra o botão para pedir.`;
  }
  return `Os ${amount} pagos ao fornecedor voltam para você.`;
}
