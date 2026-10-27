import { createFileRoute } from "@tanstack/react-router";
import { GoldenRulesPage } from "@/components/supplier-panel/rules/golden-rules-page";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/regras")({
  head: () => ({ meta: [{ title: "Regras de ouro | Painel do fornecedor" }] }),
  component: SupplierGoldenRulesRoute,
});

function SupplierGoldenRulesRoute() {
  const supplierId = usePanelSupplierId();
  return <GoldenRulesPage supplierId={supplierId} />;
}
