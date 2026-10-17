import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { SupplierProductImport } from "@/components/supplier-panel/import/supplier-product-import";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/importar")({
  head: () => ({ meta: [{ title: "Importar planilha | Painel do fornecedor" }] }),
  component: SupplierImportPage,
});

function SupplierImportPage() {
  const supplierId = usePanelSupplierId();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar planilha"
        description="Cadastre ou atualize muitos produtos de uma vez. Cada um passa pela análise antes de aparecer para os revendedores."
      />
      <SupplierProductImport supplierId={supplierId} />
    </div>
  );
}
