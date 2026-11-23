import { createFileRoute } from "@tanstack/react-router";
import { ReceivingPage } from "@/components/supplier-payments/receiving-page";
import { mercadoPagoOutcomeSearch } from "@/features/supplier-payments/mercado-pago-connection";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/recebimentos")({
  validateSearch: mercadoPagoOutcomeSearch,
  head: () => ({ meta: [{ title: "Recebimentos | Painel do fornecedor" }] }),
  component: SupplierReceivingRoute,
});

function SupplierReceivingRoute() {
  const supplierId = usePanelSupplierId();
  return <ReceivingPage supplierId={supplierId} />;
}
