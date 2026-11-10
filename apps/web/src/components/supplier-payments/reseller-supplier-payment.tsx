import { formatCents } from "@sellbridge/shared/money";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  confirmSupplierPaymentReturnFn,
  startSupplierCheckoutFn,
} from "@/features/supplier-payments/supplier-payments.functions";
import { resellerSupplierPaymentQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { errorMessage } from "@/lib/errors";
import { paymentMethodWord, SupplierPaymentBadgeView } from "./supplier-payment-badge";

/** Mercado Pago's return adds `payment_id` to the order page; `envio` names the parcel. */
function returnedPaymentId(shipmentId: string): string | null {
  const search = new URLSearchParams(window.location.search);
  const paymentId = search.get("payment_id");
  if (search.get("envio") !== shipmentId || paymentId === null || !/^\d{1,30}$/.test(paymentId)) {
    return null;
  }
  return paymentId;
}

/** What Mercado Pago appends to the return address, plus the parcel the page was told about. */
const RETURN_PARAMS = [
  "envio",
  "payment_id",
  "collection_id",
  "collection_status",
  "status",
  "external_reference",
  "payment_type",
  "merchant_order_id",
  "preference_id",
  "site_id",
  "processing_mode",
  "merchant_account_id",
];

function forgetReturnParams(): void {
  const url = new URL(window.location.href);
  for (const key of RETURN_PARAMS) {
    url.searchParams.delete(key);
  }
  window.history.replaceState(window.history.state, "", url.toString());
}

/** Reads the payment right after the checkout, so the badge does not wait for the notice. */
function useCheckoutReturn(shipmentId: string) {
  const queryClient = useQueryClient();
  const handled = useRef(false);
  const confirm = useMutation({
    mutationFn: (providerPaymentId: string) =>
      confirmSupplierPaymentReturnFn({ data: { shipmentId, providerPaymentId } }),
    onSuccess: (view) => {
      queryClient.setQueryData(resellerSupplierPaymentQueryOptions(shipmentId).queryKey, view);
      if (view.badge.kind === "paid") {
        toast.success("Pagamento confirmado. O valor já está na conta do fornecedor.");
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  useEffect(() => {
    if (handled.current) {
      return;
    }
    handled.current = true;
    const paymentId = returnedPaymentId(shipmentId);
    if (paymentId === null) {
      return;
    }
    forgetReturnParams();
    confirm.mutate(paymentId);
  }, [shipmentId, confirm]);
  return confirm.isPending;
}

function PayButton({ shipmentId }: { shipmentId: string }) {
  const start = useMutation({
    mutationFn: () => startSupplierCheckoutFn({ data: { shipmentId } }),
    onSuccess: ({ checkoutUrl }) => {
      window.location.assign(checkoutUrl);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  // Stays "Abrindo…" until the browser leaves for the checkout: a second click would not help.
  const busy = start.isPending || start.isSuccess;
  return (
    <Button size="lg" disabled={busy} onClick={() => start.mutate()}>
      {busy ? "Abrindo o Mercado Pago…" : "Pagar com Pix ou cartão"}
    </Button>
  );
}

/**
 * The reseller pays the parcel's supplier through Mercado Pago, or sees that it was paid (and
 * when), or that this supplier is paid off the system.
 */
export function ResellerSupplierPayment({ shipmentId }: { shipmentId: string }) {
  const query = useQuery(resellerSupplierPaymentQueryOptions(shipmentId));
  const confirming = useCheckoutReturn(shipmentId);
  if (query.isPending || confirming) {
    return <Skeleton className="h-24 rounded-2xl" />;
  }
  if (query.data === undefined) {
    return null;
  }
  const view = query.data;
  const method = view.badge.kind === "paid" ? paymentMethodWord(view.badge.method) : null;
  return (
    <div className="grid gap-2.5 rounded-2xl bg-muted/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Pagamento ao fornecedor</span>
        <SupplierPaymentBadgeView badge={view.badge} paidWord="Fornecedor pago" />
      </div>
      {view.canPay ? (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className="sr-only">Valor:</span>
            <strong className="text-2xl font-semibold">{formatCents(view.amountCents)}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PayButton shipmentId={shipmentId} />
            <span className="text-sm text-muted-foreground">
              Você paga pelo Mercado Pago e o valor cai direto na conta do fornecedor.
            </span>
          </div>
        </>
      ) : null}
      {view.badge.kind === "paid" ? (
        <p className="text-sm">
          {formatCents(view.amountCents)} pagos{method === null ? "" : ` por ${method}`} no Mercado
          Pago.
        </p>
      ) : null}
      {view.badge.kind === "refunded" ? (
        <p className="text-sm">O pagamento voltou para você no Mercado Pago.</p>
      ) : null}
      {view.badge.kind === "outside" || (view.badge.kind === "waiting" && !view.canPay) ? (
        <p className="text-sm">
          {view.refusal ?? "Combine o pagamento com o fornecedor, como hoje."}
        </p>
      ) : null}
    </div>
  );
}
