import { formatCents } from "@sellbridge/shared/money";
import { supplierNetForOrder } from "@sellbridge/shared/supplier-net-amount";
import { CARD_METHODS } from "@/features/supplier-payments/refund-copy";

const ENDED_SALE_TEXT: Record<string, string> = {
  cancelled: "Nada · venda cancelada",
  returned: "Nada · produto devolvido",
};

/**
 * "Você recebe" in the supplier's order window: about what is left of the parcel's cost after
 * SellBridge's 4% and the Asaas fee while the sale stands, and nothing once the sale or the parcel
 * was cancelled or came back, since that money goes back to the reseller.
 */
export function receivableText(parcel: {
  status: string;
  orderStatus: string;
  receivableCents: number;
  /** How the reseller paid, when it did: decides which Asaas fee is estimated. */
  paidMethod?: string | null;
}): string {
  const ended = ENDED_SALE_TEXT[parcel.status] ?? ENDED_SALE_TEXT[parcel.orderStatus];
  if (ended !== undefined) {
    return ended;
  }
  if (parcel.receivableCents === 0) {
    return formatCents(0);
  }
  const method = CARD_METHODS.has(parcel.paidMethod ?? "") ? "CREDIT_CARD" : "PIX";
  const { netCents } = supplierNetForOrder(parcel.receivableCents, method);
  return `Cerca de ${formatCents(netCents)} (vendido por ${formatCents(parcel.receivableCents)})`;
}
