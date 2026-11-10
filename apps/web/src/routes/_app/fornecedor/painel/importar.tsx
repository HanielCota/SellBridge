import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { BlingSection } from "@/components/supplier-panel/bling/bling-section";
import { SupplierProductImport } from "@/components/supplier-panel/import/supplier-product-import";
import { blingOutcomeSearch } from "@/features/supplier-panel/bling/bling-connection";
import type { BlingImportOutcome } from "@/features/supplier-panel/bling/bling-overview";
import { useBlingActions, useBlingOverview } from "@/features/supplier-panel/bling/use-bling";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/importar")({
  validateSearch: blingOutcomeSearch,
  head: () => ({ meta: [{ title: "Importar produtos | Painel do fornecedor" }] }),
  component: SupplierImportPage,
});

function SupplierImportPage() {
  const supplierId = usePanelSupplierId();
  const { bling } = Route.useSearch();
  const overview = useBlingOverview(supplierId);
  const { refresh } = useBlingActions(supplierId);
  const [lastImport, setLastImport] = useState<BlingImportOutcome | null>(null);
  const blingOn = overview.data?.available === true;
  const previewing = overview.data?.read?.status === "ready" && lastImport === null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar produtos"
        description="Traga seus produtos do Bling ou de uma planilha. Os completos aparecem na hora para os revendedores."
      />
      <BlingSection
        supplierId={supplierId}
        overview={overview}
        outcome={bling}
        lastImport={lastImport}
        onImported={setLastImport}
        onDismissImport={() => {
          setLastImport(null);
          void refresh();
        }}
      />
      {previewing ? null : (
        <section className="space-y-4" aria-labelledby={blingOn ? "importar-planilha" : undefined}>
          {blingOn ? (
            <h2 id="importar-planilha" className="text-subhead font-medium">
              Ou envie uma planilha
            </h2>
          ) : null}
          <SupplierProductImport supplierId={supplierId} />
        </section>
      )}
    </div>
  );
}
