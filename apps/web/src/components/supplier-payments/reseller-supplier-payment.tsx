import { ChatCircleDotsIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import type { SupplierPayMethod } from "@sellbridge/shared/shipment-payments";
import { RESELLER_HOLD_MESSAGES } from "@sellbridge/shared/receiving-rules";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { confirmAsaasPaymentReturnFn } from "@/features/supplier-payments/asaas.functions";
import {
  confirmSupplierPaymentReturnFn,
  type getResellerSupplierPaymentFn,
  startSupplierCheckoutFn,
} from "@/features/supplier-payments/supplier-payments.functions";
import { resellerRefundText } from "@/features/supplier-payments/refund-copy";
import { resellerSupplierPaymentQueryOptions } from "@/features/supplier-payments/supplier-payments.queries";
import { SUPPORT_HOURS_TEXT } from "@/features/support/response-time";
import { supplierRefundTicketSearch } from "@/features/support/talk-to-support";
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

/** Asaas's page sends the reseller back with `pagamento=asaas`; `envio` names the parcel. */
function returnedFromAsaas(shipmentId: string): boolean {
  const search = new URLSearchParams(window.location.search);
  return search.get("envio") === shipmentId && search.get("pagamento") === "asaas";
}

/** What Mercado Pago appends to the return address, plus the parcel the page was told about. */
const RETURN_PARAMS = [
  "envio",
  "pagamento",
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
    mutationFn: async (providerPaymentId: string | null) =>
      providerPaymentId === null
        ? confirmAsaasPaymentReturnFn({ data: { shipmentId } })
        : confirmSupplierPaymentReturnFn({ data: { shipmentId, providerPaymentId } }),
    onSuccess: (view) => {
      queryClient.setQueryData(resellerSupplierPaymentQueryOptions(shipmentId).queryKey, view);
      if (view.badge.kind === "paid") {
        toast.success(
          view.protectedPayment
            ? "Pagamento confirmado. O valor fica protegido até a entrega."
            : "Pagamento confirmado. O valor já está na conta do fornecedor.",
        );
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  useEffect(() => {
    if (handled.current) {
      return;
    }
    handled.current = true;
    if (returnedFromAsaas(shipmentId)) {
      forgetReturnParams();
      confirm.mutate(null);
      return;
    }
    const paymentId = returnedPaymentId(shipmentId);
    if (paymentId === null) {
      return;
    }
    forgetReturnParams();
    confirm.mutate(paymentId);
  }, [shipmentId, confirm]);
  return confirm.isPending;
}

/** Pix first: most resellers pay that way. Never boleto, which Asaas cannot refund. */
const PAY_CHOICES: readonly { method: SupplierPayMethod; label: string; primary: boolean }[] = [
  { method: "PIX", label: "Pagar com Pix", primary: true },
  { method: "CREDIT_CARD", label: "Pagar com cartão", primary: false },
];

function PayButtons({ shipmentId, gateway }: { shipmentId: string; gateway: string }) {
  const queryClient = useQueryClient();
  const start = useMutation({
    mutationFn: (payMethod: SupplierPayMethod) =>
      startSupplierCheckoutFn({ data: { shipmentId, payMethod } }),
    onSuccess: ({ checkoutUrl }) => {
      window.location.assign(checkoutUrl);
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      // The click may have found an earlier payment under review or approved: show it.
      await queryClient.invalidateQueries({
        queryKey: resellerSupplierPaymentQueryOptions(shipmentId).queryKey,
      });
    },
  });
  // Stays "Abrindo…" until the browser leaves for the checkout: a second click would not help.
  const busy = start.isPending || start.isSuccess;
  return (
    <div className="flex flex-wrap gap-2">
      {PAY_CHOICES.map((choice) => (
        <Button
          key={choice.method}
          size="lg"
          variant={choice.primary ? "default" : "outline"}
          disabled={busy}
          onClick={() => start.mutate(choice.method)}
        >
          {busy && start.variables === choice.method ? `Abrindo o ${gateway}…` : choice.label}
        </Button>
      ))}
    </div>
  );
}

type PaymentView = Awaited<ReturnType<typeof getResellerSupplierPaymentFn>>;

const NOT_OFFERED_MESSAGE = "O pagamento ao fornecedor pelo SellBridge ainda não foi ligado.";

/**
 * Why the reseller cannot pay here now: the reason the server gave, or that paying suppliers
 * through SellBridge is not switched on. A parcel waiting for the account already says so above.
 */
function WhyNotPaid({ view }: { view: PaymentView }) {
  if (view.badge.kind === "not_offered") {
    return <p className="text-sm">{NOT_OFFERED_MESSAGE}</p>;
  }
  const blocked =
    view.badge.kind === "no_account" ||
    view.badge.kind === "reviewing" ||
    (view.badge.kind === "waiting" && !view.canPay);
  if (!blocked || view.refusal === null || view.preparationHold === "receiving_account") {
    return null;
  }
  return <p className="text-sm">{view.refusal}</p>;
}

/** The seal on a protected payment, with Guilherme's words (15/11/2026). */
function ProtectedSeal() {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-medium text-white">
      <ShieldCheckIcon aria-hidden="true" className="mt-0.5 size-4 flex-none" weight="fill" />
      Pagamento protegido: liberado ao fornecedor só depois da entrega
    </p>
  );
}

/**
 * The way to the team for a refund it makes by hand: a ticket already about the order and the
 * amount, or the ticket the reseller opened before, never a second one.
 */
function ManualRefundAction({ view }: { view: PaymentView }) {
  const manual = view.manualRefund;
  if (manual === null || view.badge.kind !== "refunding") {
    return null;
  }
  const link =
    manual.ticketId === null ? (
      <Link
        to="/suporte/novo"
        search={supplierRefundTicketSearch({
          id: manual.orderId,
          name: manual.orderName,
          amount: formatCents(view.amountCents),
        })}
      >
        <ChatCircleDotsIcon aria-hidden="true" />
        Pedir a devolução à equipe
      </Link>
    ) : (
      <Link to="/suporte/$ticketId" params={{ ticketId: manual.ticketId }}>
        <ChatCircleDotsIcon aria-hidden="true" />
        Ver o chamado deste pedido
      </Link>
    );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button asChild size="lg" variant="outline">
        {link}
      </Button>
      <span className="text-sm text-muted-foreground">{SUPPORT_HOURS_TEXT}</span>
    </div>
  );
}

/**
 * The reseller pays the parcel's supplier through Asaas, or sees that it was paid (and when), or
 * why it cannot pay here yet. Mercado Pago is hidden since 18/11/2026; it is named
 * only for a payment that already went through it.
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
  const refundText = resellerRefundText(view);
  const gateway = view.provider === "mercado_pago" ? "Mercado Pago" : "Asaas";
  return (
    <div className="grid gap-2.5 rounded-2xl bg-muted/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">Pagamento ao fornecedor</span>
        <SupplierPaymentBadgeView badge={view.badge} paidWord="Fornecedor pago" />
      </div>
      {view.protectedPayment && view.badge.kind !== "refunded" ? <ProtectedSeal /> : null}
      {view.canPay ? (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className="sr-only">Valor:</span>
            <strong className="text-2xl font-semibold">{formatCents(view.amountCents)}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <PayButtons shipmentId={shipmentId} gateway={gateway} />
            <span className="text-sm text-muted-foreground">
              Pix ou cartão de crédito à vista, pelo Asaas. O valor fica guardado e só vai para o
              fornecedor depois da entrega.
            </span>
          </div>
        </>
      ) : null}
      {view.badge.kind === "paid" ? (
        <p className="text-sm">
          {formatCents(view.amountCents)} pagos{method === null ? "" : ` por ${method}`} no{" "}
          {gateway}.
        </p>
      ) : null}
      {refundText === null ? null : <p className="text-sm">{refundText}</p>}
      <ManualRefundAction view={view} />
      {view.preparationHold === null ? null : (
        <p className="text-sm font-medium">{RESELLER_HOLD_MESSAGES[view.preparationHold]}</p>
      )}
      <WhyNotPaid view={view} />
    </div>
  );
}
