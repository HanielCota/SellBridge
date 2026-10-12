import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ShipmentPanel } from "@/components/fulfillment/shipment-panel";
import { ErrorState } from "@/components/feedback/error-state";
import {
  getSupplierShipmentFn,
  updateSupplierShipmentFn,
} from "@/features/fulfillment/fulfillment.functions";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/fornecedor/pedido/$token")({
  head: () => ({
    meta: [
      { title: "Ordem de fornecimento | SellBridge" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SupplierOrderPage,
});
function SupplierOrderPage() {
  const { token } = Route.useParams();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["supplier-shipment", token],
    queryFn: () => getSupplierShipmentFn({ data: { token } }),
    refetchInterval: 15000,
    retry: false,
  });
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <header>
        <p className="text-sm text-muted-foreground">SellBridge · Portal do fornecedor</p>
        <h1 className="mt-2 text-2xl font-semibold">Ordem de fornecimento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirme o recebimento, separe os itens e registre o despacho e o rastreio.
        </p>
      </header>
      {query.isPending ? (
        <p>Carregando ordem…</p>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <p>Pedido {query.data.externalOrderId}</p>
          {["cancelled", "returned", "pending"].includes(query.data.orderStatus) ? (
            <p className="text-destructive">
              Pedido sem liberação para envio. Entre em contato com o revendedor.
            </p>
          ) : null}
          <ShipmentPanel
            shipment={query.data}
            externalOrderId={query.data.externalOrderId}
            blocked={["cancelled", "returned", "pending"].includes(query.data.orderStatus)}
            onUpdate={async (update) => {
              await updateSupplierShipmentFn({ data: { token, update } });
              await client.invalidateQueries({ queryKey: ["supplier-shipment", token] });
            }}
          >
            {query.data.marketplace === "mercado_livre" ? (
              <Button variant="outline" asChild>
                <a
                  href={`/api/pedidos/${query.data.orderId}/etiqueta?token=${token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Etiqueta de postagem do marketplace
                </a>
              </Button>
            ) : null}
          </ShipmentPanel>
        </>
      )}
    </main>
  );
}
