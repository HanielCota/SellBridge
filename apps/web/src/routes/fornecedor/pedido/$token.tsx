import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supplierPanelOrderPath } from "@sellbridge/shared/supplier-order-email";
import { createFileRoute } from "@tanstack/react-router";
import { isLabelMarketplace } from "@sellbridge/shared/supplier-order-labels";
import { useState } from "react";
import { InlineFormError } from "@/components/form/inline-form-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShipmentPanel } from "@/components/fulfillment/shipment-panel";
import { SupplierPageFrame } from "@/components/fulfillment/supplier-page-frame";
import { ErrorState } from "@/components/feedback/error-state";
import { updateSupplierShipmentFn } from "@/features/fulfillment/fulfillment.functions";
import { supplierShipmentQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import {
  isPreparationStopped,
  type SaleStopNotice,
  saleStopNotice,
} from "@/features/fulfillment/shipping-block";
import { PreparationHoldAlert } from "@/components/supplier-panel/orders/preparation-hold-alert";
import { inviteFromOrderLinkFn } from "@/features/supplier-invite/supplier-invite.functions";
import { errorMessage } from "@/lib/errors";
import { SHARE_IMAGES, shareMeta } from "@/lib/share-meta";

export const Route = createFileRoute("/fornecedor/pedido/$token")({
  head: () => ({
    meta: [
      ...shareMeta({
        title: "Ordem de fornecimento | SellBridge",
        description:
          "Pedido de um revendedor SellBridge para separar e enviar. Abra para ver os itens e o endereço.",
        image: SHARE_IMAGES.symbol,
      }),
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SupplierOrderPage,
});

const INSTRUCTIONS = "Confirme o recebimento, separe os itens e registre o despacho e o rastreio.";

function OrderHeading({ externalOrderId }: { externalOrderId: string | null }) {
  return (
    <div className="space-y-2">
      {externalOrderId === null ? (
        <h1 className="text-2xl font-semibold tracking-tight">Ordem de fornecimento</h1>
      ) : (
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
          Pedido <span className="inline-block max-w-full break-all">{externalOrderId}</span>
        </h1>
      )}
      <p className="text-sm text-muted-foreground">{INSTRUCTIONS}</p>
    </div>
  );
}

/** Same shape as the shipment panel: summary, the print buttons, the fields and the history. */
function ShipmentPanelSkeleton() {
  return (
    <output
      className="block surface-card space-y-4 rounded-2xl bg-card p-5"
      aria-busy="true"
      aria-label="Carregando ordem"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-56 rounded-full" />
        <Skeleton className="h-9 w-52 rounded-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-xl" />
      <div className="space-y-2 border-t pt-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
    </output>
  );
}

function ShippingBlockedAlert({ notice }: { notice: SaleStopNotice | null }) {
  if (notice === null) {
    return null;
  }
  return (
    <Alert variant="destructive">
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.description}</AlertDescription>
    </Alert>
  );
}

/** A supplier with its own panel: the link only says where the order is now. */
function OrderInPanel({ externalOrderId }: { externalOrderId: string }) {
  const panelOrder = supplierPanelOrderPath(externalOrderId);
  return (
    <section className="surface-card space-y-4 rounded-2xl bg-card p-5" aria-labelledby="moved">
      <h1 id="moved" className="text-2xl font-semibold tracking-tight">
        O pedido <span className="inline-block max-w-full break-all">{externalOrderId}</span> está
        no seu painel
      </h1>
      <p className="text-sm text-muted-foreground">
        Os pedidos agora ficam só no painel do fornecedor. Entre com a sua conta para aceitar,
        separar e informar o envio.
      </p>
      <Button asChild size="lg">
        <a href={panelOrder}>Abrir no painel</a>
      </Button>
    </section>
  );
}

/** Suppliers who only ever used links: the way to their panel, without leaving the order. */
function PanelInviteNotice({ token }: { token: string }) {
  const [isOpening, setIsOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function openInvite() {
    setIsOpening(true);
    setFailure(null);
    try {
      const { invitePath } = await inviteFromOrderLinkFn({ data: { token } });
      window.location.assign(invitePath);
    } catch (error) {
      setFailure(errorMessage(error));
      setIsOpening(false);
    }
  }

  return (
    <Alert>
      <AlertTitle>Os pedidos vão ficar só no painel do fornecedor</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Crie seu acesso com o seu e-mail de pedidos para ver todos os pedidos num lugar só. Este
          pedido continua aqui até lá.
        </p>
        <Button variant="outline" disabled={isOpening} onClick={() => void openInvite()}>
          {isOpening ? "Abrindo..." : "Criar meu acesso ao painel"}
        </Button>
        <InlineFormError message={failure} />
      </AlertDescription>
    </Alert>
  );
}

function MarketplaceLabelForm({ token, orderId }: { token: string; orderId: string }) {
  return (
    // A form post keeps the token out of the URL, the history and the access logs.
    <form
      method="post"
      action={`/api/pedidos/${orderId}/etiqueta`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <input type="hidden" name="token" value={token} />
      <Button type="submit" variant="outline">
        Etiqueta de postagem do marketplace
      </Button>
    </form>
  );
}

function SupplierOrderPage() {
  const { token } = Route.useParams();
  const client = useQueryClient();
  const shipmentQuery = supplierShipmentQueryOptions(token);
  const query = useQuery(shipmentQuery);
  if (query.isPending) {
    return (
      <SupplierPageFrame>
        <OrderHeading externalOrderId={null} />
        <ShipmentPanelSkeleton />
      </SupplierPageFrame>
    );
  }
  if (query.isError) {
    return (
      <SupplierPageFrame>
        <OrderHeading externalOrderId={null} />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </SupplierPageFrame>
    );
  }
  if (query.data.access === "panel") {
    return (
      <SupplierPageFrame>
        <OrderInPanel externalOrderId={query.data.externalOrderId} />
      </SupplierPageFrame>
    );
  }
  const shipment = query.data.shipment;
  const blocked = isPreparationStopped(shipment);
  const hold = shipment.preparationHold;
  return (
    <SupplierPageFrame>
      <OrderHeading externalOrderId={shipment.externalOrderId} />
      <PanelInviteNotice token={token} />
      <ShippingBlockedAlert
        notice={saleStopNotice(shipment.orderStatus, shipment.status, "link")}
      />
      {hold !== null && <PreparationHoldAlert hold={hold} showAccountLink={false} />}
      <ShipmentPanel
        shipment={shipment}
        externalOrderId={shipment.externalOrderId}
        actsAs="supplier"
        blocked={blocked}
        onUpdate={async (update) => {
          await updateSupplierShipmentFn({ data: { token, update } });
          await client.invalidateQueries({ queryKey: shipmentQuery.queryKey });
        }}
      >
        {isLabelMarketplace(shipment.marketplace) && !blocked && (
          <MarketplaceLabelForm token={token} orderId={shipment.orderId} />
        )}
      </ShipmentPanel>
    </SupplierPageFrame>
  );
}
