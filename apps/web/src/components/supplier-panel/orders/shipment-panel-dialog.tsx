import { WarningIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { LabelFormat } from "@sellbridge/shared/schemas";
import { type ReactNode, useRef } from "react";
import { formatCents } from "@sellbridge/shared/money";
import { DISPATCHED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import {
  BATCH_LABEL_MARKETPLACE,
  isLabelMarketplace,
} from "@sellbridge/shared/supplier-order-labels";
import { ShipmentPanel } from "@/components/fulfillment/shipment-panel";
import { Button } from "@/components/ui/button";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { SupplierPaymentBadgeView } from "@/components/supplier-payments/supplier-payment-badge";
import { shippingMethod } from "@/features/supplier-panel/orders/shipping-methods";
import { ErrorState } from "@/components/feedback/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
import { displayBuyerName } from "@/features/orders/buyer-name";
import { channelLabel, channelSource } from "@/features/supplier-panel/orders/channel-labels";
import { dispatchInvoiceReminder } from "@/features/supplier-panel/orders/dispatch-invoice-reminder";
import { orderSteps } from "@/features/supplier-panel/orders/order-steps";
import { supplierPanelShipmentQueryOptions } from "@/features/supplier-panel/orders/orders.queries";
import { useSupplierShipmentUpdate } from "@/features/supplier-panel/orders/use-order-actions";
import { errorMessage } from "@/lib/errors";
import { useTabProfileLink } from "@/lib/tab-profile";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { SplitLabelNotice } from "@/components/fulfillment/split-order-notice";
import { LabelFormatMenu } from "./label-format-menu";
import { LabelStatus, PostingDeadlineStatus } from "./order-row-parts";
import { SupplierInvoiceCard } from "./supplier-invoice-card";
import { SupplierParcelTracking } from "./supplier-parcel-tracking";

type PanelShipment = Awaited<
  ReturnType<
    typeof import("@/features/supplier-panel/orders/orders.functions").getSupplierPanelShipmentFn
  >
>;

/** "Impressa 2 vezes, a última em 04/11/2026, 09:31": how often the label went out. */
function labelHistory(shipment: PanelShipment): string | null {
  if (shipment.labelPrintCount === 0 || shipment.labelPrintedAt === null) {
    return null;
  }
  const times = shipment.labelPrintCount === 1 ? "1 vez" : `${shipment.labelPrintCount} vezes`;
  return `Impressa ${times}, a última em ${formatAbsoluteTime(shipment.labelPrintedAt)}.`;
}

/** The channel's logo beside its name, as the stores screen shows it. */
function ChannelWithLogo({ marketplace }: { marketplace: string }) {
  return (
    <span className="flex items-center gap-2">
      <MarketplaceMark marketplace={marketplace} className="size-6 rounded-lg" />
      {channelLabel(marketplace)}
    </span>
  );
}

/** Each step the parcel went through with its date and time; the steps ahead say "Ainda não". */
function OrderStepsList({ shipment }: { shipment: PanelShipment }) {
  const steps = orderSteps({
    events: shipment.events,
    labelPrintedAt: shipment.labelPrintedAt,
    hasMarketplaceLabel: shipment.labelState !== null,
    invoice: shipment.invoice,
  });
  return (
    <div className="space-y-2">
      <h3 className="text-footnote text-muted-foreground">Etapas</h3>
      <ol className="space-y-1.5 text-subhead">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  step.at === null ? "border border-muted-foreground" : "bg-emerald-700",
                )}
              />
              <span className={step.at === null ? "text-muted-foreground" : "font-medium"}>
                {step.label}
              </span>
            </span>
            {step.at === null ? (
              <span className="text-footnote text-muted-foreground">Ainda não</span>
            ) : (
              <time
                dateTime={step.at.toISOString()}
                className="text-footnote tabular-nums"
                suppressHydrationWarning
              >
                {formatAbsoluteTime(step.at)}
              </time>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Who sold, who bought, through which channel, what the supplier receives, and the label. */
function OrderFacts({ shipment }: { shipment: PanelShipment }) {
  const now = useNow();
  const history = labelHistory(shipment);
  const facts: { term: string; detail: ReactNode }[] = [
    { term: "Canal", detail: <ChannelWithLogo marketplace={shipment.marketplace} /> },
    { term: "Loja do revendedor", detail: shipment.shopName },
    { term: "Cliente", detail: displayBuyerName(shipment.buyerName) },
    { term: "Você recebe", detail: formatCents(shipment.receivableCents) },
  ];
  const method = shippingMethod(shipment.marketplaceLogisticType);
  if (method !== null) {
    facts.push({ term: "Forma de envio", detail: method.long });
  }
  return (
    <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <SupplierPaymentBadgeView badge={shipment.supplierPayment} />
        {shipment.supplierPayment.kind === "outside" ? (
          <span className="text-footnote text-muted-foreground">
            O revendedor paga você por fora, como hoje.
          </span>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.term} className="min-w-0">
            <dt className="text-footnote text-muted-foreground">{fact.term}</dt>
            <dd className="font-medium break-words">{fact.detail}</dd>
          </div>
        ))}
      </dl>
      <PostingDeadlineStatus parcel={shipment} now={now} />
      {shipment.labelState === null ? null : (
        <div className="space-y-1">
          <LabelStatus state={shipment.labelState} printedAt={null} />
          {history === null ? null : (
            <p className="text-footnote text-muted-foreground">{history}</p>
          )}
        </div>
      )}
      <OrderStepsList shipment={shipment} />
    </div>
  );
}

const LABEL_BUTTON_CLASS = "h-auto min-h-9 max-w-full py-1.5 whitespace-normal";

/**
 * Opens the marketplace label in a new tab, like the supplier link's page does, but from the
 * signed-in panel: the ids go in the form body and the server checks the panel session. The PDF
 * opens there, the browser downloads the ZPL, and an error shows in the tab. A channel with only
 * a PDF label (TikTok Shop) gets a plain button instead of the printer menu.
 */
function MarketplaceLabelForm({
  supplierId,
  shipmentId,
  orderId,
  printed,
  pdfOnly,
}: {
  supplierId: string;
  shipmentId: string;
  orderId: string;
  printed: boolean;
  pdfOnly: boolean;
}) {
  const withProfile = useTabProfileLink();
  const buttonText = printed
    ? "Reimprimir etiqueta do marketplace"
    : "Imprimir etiqueta do marketplace";
  const formRef = useRef<HTMLFormElement>(null);
  const formatRef = useRef<HTMLInputElement>(null);
  const print = (format: LabelFormat) => {
    if (formRef.current === null || formatRef.current === null) {
      return;
    }
    formatRef.current.value = format;
    formRef.current.requestSubmit();
  };
  return (
    <form
      ref={formRef}
      method="post"
      action={withProfile(`/api/pedidos/${orderId}/etiqueta`)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input ref={formatRef} type="hidden" name="formato" defaultValue="pdf" />
      {/* Wraps like the panel's other buttons, which the panel styles only as its own children. */}
      {pdfOnly ? (
        <Button type="submit" variant="outline" className={LABEL_BUTTON_CLASS}>
          {buttonText}
        </Button>
      ) : (
        <LabelFormatMenu size="default" className={LABEL_BUTTON_CLASS} onChoose={print}>
          {buttonText}
        </LabelFormatMenu>
      )}
    </form>
  );
}

/** Before "Despachar": a note still on its way or stopped, so the parcel leaves with its DANFE. */
function DispatchInvoiceAlert({ shipment }: { shipment: PanelShipment }) {
  const reminder = dispatchInvoiceReminder(shipment.status, shipment.invoice?.status ?? null);
  if (reminder === null) {
    return null;
  }
  return (
    <Alert>
      <WarningIcon aria-hidden="true" />
      <AlertTitle>{reminder.title}</AlertTitle>
      <AlertDescription>{reminder.description}</AlertDescription>
    </Alert>
  );
}

/** The opened parcel: the same shipment panel the supplier link shows, acting as the supplier. */
function PanelBody({ supplierId, shipmentId }: { supplierId: string; shipmentId: string }) {
  const query = useQuery(supplierPanelShipmentQueryOptions(supplierId, shipmentId));
  const onUpdate = useSupplierShipmentUpdate(supplierId);
  if (query.isPending) {
    return (
      <output className="block space-y-3" aria-busy="true" aria-label="Carregando pedido">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </output>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  const blocked = isShippingBlocked(query.data.orderStatus);
  const tracked = DISPATCHED_FULFILLMENT_STATUSES.includes(query.data.status);
  // Before dispatch only the marketplace writes the tracking: people type it when shipping.
  const trackingFromChannel =
    tracked || query.data.trackingCode === null ? null : channelSource(query.data.marketplace);
  return (
    <div className="space-y-4">
      <OrderFacts shipment={query.data} />
      <SupplierInvoiceCard
        supplierId={supplierId}
        shipmentId={shipmentId}
        orderId={query.data.orderId}
        invoice={query.data.invoice}
      />
      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle>Venda não liberada</AlertTitle>
          <AlertDescription>Fale com o revendedor antes de separar ou despachar.</AlertDescription>
        </Alert>
      ) : (
        <DispatchInvoiceAlert shipment={query.data} />
      )}
      {query.data.splitOrder ? <SplitLabelNotice /> : null}
      {tracked ? <SupplierParcelTracking supplierId={supplierId} shipmentId={shipmentId} /> : null}
      <ShipmentPanel
        shipment={{ ...query.data, trackingFromChannel }}
        externalOrderId={query.data.externalOrderId}
        actsAs="supplier"
        blocked={blocked}
        showHistory={!tracked}
        onUpdate={onUpdate}
      >
        {!isLabelMarketplace(query.data.marketplace) || query.data.splitOrder ? null : (
          <MarketplaceLabelForm
            supplierId={supplierId}
            shipmentId={shipmentId}
            orderId={query.data.orderId}
            printed={query.data.labelPrintCount > 0}
            pdfOnly={query.data.marketplace !== BATCH_LABEL_MARKETPLACE}
          />
        )}
      </ShipmentPanel>
    </div>
  );
}

export function ShipmentPanelDialog({
  supplierId,
  opened,
  onClose,
}: {
  supplierId: string;
  opened: { id: string; externalOrderId: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={opened !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pedido {opened?.externalOrderId}</DialogTitle>
          {/* Read by screen readers only: the panel below says the rest. */}
          <DialogDescription className="sr-only">Etapas, ocorrências e rastreio.</DialogDescription>
        </DialogHeader>
        {opened === null ? null : (
          <PanelBody key={opened.id} supplierId={supplierId} shipmentId={opened.id} />
        )}
      </DialogContent>
    </Dialog>
  );
}
