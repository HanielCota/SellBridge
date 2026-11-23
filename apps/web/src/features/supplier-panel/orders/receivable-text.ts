import { formatCents } from "@sellbridge/shared/money";

const ENDED_SALE_TEXT: Record<string, string> = {
  cancelled: "Nada · venda cancelada",
  returned: "Nada · produto devolvido",
};

/**
 * "Você recebe" in the supplier's order window: the parcel's cost while the sale stands, and
 * nothing once the sale or the parcel was cancelled or came back, since that money goes back to
 * the reseller.
 */
export function receivableText(parcel: {
  status: string;
  orderStatus: string;
  receivableCents: number;
}): string {
  const ended = ENDED_SALE_TEXT[parcel.status] ?? ENDED_SALE_TEXT[parcel.orderStatus];
  if (ended !== undefined) {
    return ended;
  }
  return formatCents(parcel.receivableCents);
}
