import { WalletIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { cancelMoneyNote } from "@/features/supplier-payments/cancel-money-note";
import { resellerSupplierPaymentQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";

/** In the reseller's cancel dialog: what happens to the money already paid to the supplier. */
export function CancelMoneyNote({
  shipmentId,
  parcelStatus,
}: {
  shipmentId: string;
  parcelStatus: string;
}) {
  const query = useQuery(resellerSupplierPaymentQueryOptions(shipmentId));
  if (query.data === undefined) {
    return null;
  }
  const note = cancelMoneyNote({
    badge: query.data.badge,
    amountCents: query.data.amountCents,
    paymentMethod: query.data.paymentMethod,
    parcelStatus,
  });
  if (note === null) {
    return null;
  }
  return (
    <p className="flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
      <WalletIcon aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <span>
        <strong className="font-medium">O que acontece com o dinheiro: </strong>
        {note}
      </span>
    </p>
  );
}
