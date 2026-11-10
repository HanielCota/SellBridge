import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@sellbridge/shared/money";
import { DISPATCHED_FULFILLMENT_STATUSES } from "@sellbridge/shared/schemas";
import { ShipmentPanel } from "@/components/fulfillment/shipment-panel";
import { SupplierPaymentBadgeView } from "@/components/supplier-payments/supplier-payment-badge";
import { shippingMethod } from "@/features/supplier-panel/orders/shipping-methods";
import { ErrorState } from "@/components/feedback/error-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { supplierPanelShipmentQueryOptions } from "@/features/supplier-panel/orders/orders.queries";
import { useSupplierShipmentUpdate } from "@/features/supplier-panel/orders/use-order-actions";
import { errorMessage } from "@/lib/errors";
import { useTabProfileLink } from "@/lib/tab-profile";
import { formatAbsoluteTime } from "@/lib/relative-time";
import { LabelStatus } from "./order-row-parts";
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

/** Who sold, who bought, through which channel, what the supplier receives, and the label. */
function OrderFacts({ shipment }: { shipment: PanelShipment }) {
  const history = labelHistory(shipment);
  const facts = [
    { term: "Canal", detail: channelLabel(shipment.marketplace) },
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
      <SupplierPaymentBadgeView badge={shipment.supplierPayment} />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-subhead sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.term} className="min-w-0">
            <dt className="text-footnote text-muted-foreground">{fact.term}</dt>
            <dd className="font-medium break-words">{fact.detail}</dd>
          </div>
        ))}
      </dl>
      {shipment.labelState === null ? null : (
        <div className="space-y-1">
          <LabelStatus state={shipment.labelState} printedAt={null} />
          {history === null ? null : (
            <p className="text-footnote text-muted-foreground">{history}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Opens the marketplace label in a new tab, like the supplier link's page does, but from the
 * signed-in panel: the ids go in the form body and the server checks the panel session.
 */
function MarketplaceLabelForm({
  supplierId,
  shipmentId,
  orderId,
  printed,
}: {
  supplierId: string;
  shipmentId: string;
  orderId: string;
  printed: boolean;
}) {
  const withProfile = useTabProfileLink();
  return (
    <form
      method="post"
      action={withProfile(`/api/pedidos/${orderId}/etiqueta`)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <Button type="submit" variant="outline">
        {printed ? "Reimprimir etiqueta do marketplace" : "Imprimir etiqueta do marketplace"}
      </Button>
    </form>
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
      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle>Venda não liberada</AlertTitle>
          <AlertDescription>Fale com o revendedor antes de separar ou despachar.</AlertDescription>
        </Alert>
      ) : null}
      {tracked ? <SupplierParcelTracking supplierId={supplierId} shipmentId={shipmentId} /> : null}
      <ShipmentPanel
        shipment={{ ...query.data, trackingFromChannel }}
        externalOrderId={query.data.externalOrderId}
        actsAs="supplier"
        blocked={blocked}
        showHistory={!tracked}
        onUpdate={onUpdate}
      >
        {query.data.marketplace === "mercado_livre" ? (
          <MarketplaceLabelForm
            supplierId={supplierId}
            shipmentId={shipmentId}
            orderId={query.data.orderId}
            printed={query.data.labelPrintCount > 0}
          />
        ) : null}
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
