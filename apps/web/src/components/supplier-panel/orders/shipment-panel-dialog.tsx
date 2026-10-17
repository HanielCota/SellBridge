import { useQuery } from "@tanstack/react-query";
import { ShipmentPanel } from "@/components/fulfillment/shipment-panel";
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
import { supplierPanelShipmentQueryOptions } from "@/features/supplier-panel/orders/orders.queries";
import { useSupplierShipmentUpdate } from "@/features/supplier-panel/orders/use-order-actions";
import { errorMessage } from "@/lib/errors";

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
  return (
    <div className="space-y-4">
      {blocked ? (
        <Alert variant="destructive">
          <AlertTitle>Venda não liberada</AlertTitle>
          <AlertDescription>Fale com o revendedor antes de separar ou despachar.</AlertDescription>
        </Alert>
      ) : null}
      <ShipmentPanel
        shipment={query.data}
        externalOrderId={query.data.externalOrderId}
        actsAs="supplier"
        blocked={blocked}
        onUpdate={onUpdate}
      />
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
