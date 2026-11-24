import { createFileRoute } from "@tanstack/react-router";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { ManualSaleForm } from "@/components/manual-sales/manual-sale-form";

export const Route = createFileRoute("/_app/pedidos/venda-manual")({
  head: () => ({ meta: [{ title: "Registrar venda manual | SellBridge" }] }),
  component: ManualSalePage,
});

function ManualSalePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink to="/pedidos" label="Pedidos" />}
        title="Registrar venda manual"
        description="Para pedidos da Shopee e do TikTok Shop. Depois de registrar, suba a etiqueta e mande o pedido ao fornecedor."
      />
      <ManualSaleForm />
    </div>
  );
}
