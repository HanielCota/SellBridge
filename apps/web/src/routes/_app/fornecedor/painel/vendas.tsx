import { reportPeriodSearchSchema, type ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { SupplierSalesPage } from "@/components/supplier-panel/sales-page/supplier-sales-page";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/vendas")({
  validateSearch: reportPeriodSearchSchema,
  head: () => ({ meta: [{ title: "Vendas | Painel do fornecedor" }] }),
  component: SupplierSalesRoute,
});

/** Only the period's own params: another month replaces `mes`, `de` and `ate` together. */
function periodSearchOf(search: ReportPeriodSearch): ReportPeriodSearch {
  return { mes: search.mes, de: search.de, ate: search.ate };
}

function SupplierSalesRoute() {
  const supplierId = usePanelSupplierId();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const onPeriodChange = useCallback(
    (next: ReportPeriodSearch) => void navigate({ search: periodSearchOf(next), replace: true }),
    [navigate],
  );
  return (
    <SupplierSalesPage
      supplierId={supplierId}
      search={periodSearchOf(search)}
      onPeriodChange={onPeriodChange}
    />
  );
}
