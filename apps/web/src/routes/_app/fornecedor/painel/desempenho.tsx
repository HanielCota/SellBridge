import { optionalParameter } from "@sellbridge/shared/schemas";
import { HEALTH_METRICS } from "@sellbridge/shared/supplier-panel-health";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SupplierPerformance } from "@/components/supplier-panel/home/supplier-performance";
import { SupplierDownloadMenu } from "@/components/supplier-panel/report/supplier-download-menu";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

const performanceSearchSchema = z.object({
  metric: optionalParameter(z.enum(HEALTH_METRICS)),
});

export const Route = createFileRoute("/_app/fornecedor/painel/desempenho")({
  validateSearch: performanceSearchSchema,
  head: () => ({ meta: [{ title: "Desempenho | Painel do fornecedor" }] }),
  component: SupplierPerformancePage,
});

function SupplierPerformancePage() {
  const supplierId = usePanelSupplierId();
  const { metric } = Route.useSearch();
  return (
    <SupplierPerformance
      supplierId={supplierId}
      initialMetric={metric}
      headerActions={<SupplierDownloadMenu />}
    />
  );
}
