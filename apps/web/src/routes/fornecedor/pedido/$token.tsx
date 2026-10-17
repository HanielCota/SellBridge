import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShipmentPanel } from "@/components/fulfillment/shipment-panel";
import { ErrorState } from "@/components/feedback/error-state";
import { updateSupplierShipmentFn } from "@/features/fulfillment/fulfillment.functions";
import { supplierShipmentQueryOptions } from "@/features/fulfillment/fulfillment.queries";
import { isShippingBlocked } from "@/features/fulfillment/shipping-block";
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

/** Public page, like the legal ones: the brand on the grouped background, no app navigation. */
function SupplierPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-surface-grouped">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-6">
        <BrandLogo className="text-xl" iconClassName="size-8" />
        <span className="text-subhead text-muted-foreground">Portal do fornecedor</span>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl space-y-5 px-4 pb-16">
        {children}
      </main>
    </div>
  );
}

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

function ShippingBlockedAlert() {
  return (
    <Alert variant="destructive">
      <AlertTitle>Pedido sem liberação para envio</AlertTitle>
      <AlertDescription>
        O marketplace ainda não liberou este pedido. Fale com o revendedor antes de separar ou
        enviar.
      </AlertDescription>
    </Alert>
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
  const blocked = isShippingBlocked(query.data.orderStatus);
  return (
    <SupplierPageFrame>
      <OrderHeading externalOrderId={query.data.externalOrderId} />
      {blocked ? <ShippingBlockedAlert /> : null}
      <ShipmentPanel
        shipment={query.data}
        externalOrderId={query.data.externalOrderId}
        actsAs="supplier"
        blocked={blocked}
        onUpdate={async (update) => {
          await updateSupplierShipmentFn({ data: { token, update } });
          await client.invalidateQueries({ queryKey: shipmentQuery.queryKey });
        }}
      >
        {query.data.marketplace === "mercado_livre" ? (
          // A form post keeps the token out of the URL, the history and the access logs.
          <form
            method="post"
            action={`/api/pedidos/${query.data.orderId}/etiqueta`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="outline">
              Etiqueta de postagem do marketplace
            </Button>
          </form>
        ) : null}
      </ShipmentPanel>
    </SupplierPageFrame>
  );
}
