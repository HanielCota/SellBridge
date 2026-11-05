import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { ScanCheck } from "@/components/supplier-panel/orders/scan-check";
import { Button } from "@/components/ui/button";
import { SUPPLIER_PANEL_BASE_PATH } from "@/features/supplier-panel/home/attention-links";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";
import { useTabProfileLink } from "@/lib/tab-profile";

export const Route = createFileRoute("/_app/fornecedor/painel/conferir")({
  head: () => ({ meta: [{ title: "Conferir com leitor | Painel do fornecedor" }] }),
  component: SupplierScanPage,
});

function SupplierScanPage() {
  const supplierId = usePanelSupplierId();
  const profileLink = useTabProfileLink();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conferir com leitor"
        description="Leia a etiqueta de cada pacote para marcar a separação ou o despacho, sem abrir pedido por pedido."
        actions={
          <Button asChild variant="outline">
            <a href={profileLink(`${SUPPLIER_PANEL_BASE_PATH}/pedidos`)}>Voltar aos pedidos</a>
          </Button>
        }
      />
      <ScanCheck supplierId={supplierId} />
    </div>
  );
}
