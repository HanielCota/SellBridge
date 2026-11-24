import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import { reportPeriodSearchSchema, type ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { SupplierStatementPage } from "@/components/supplier-panel/statement/supplier-statement-page";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";

export const Route = createFileRoute("/_app/fornecedor/painel/extrato")({
  validateSearch: reportPeriodSearchSchema,
  head: () => ({ meta: [{ title: "Extrato | Painel do fornecedor" }] }),
  component: SupplierStatementRoute,
});

/** Only the statement's own params: another month replaces `mes`, `de` and `ate` together. */
function periodSearchOf(search: ReportPeriodSearch): ReportPeriodSearch {
  return { mes: search.mes, de: search.de, ate: search.ate };
}

function SupplierStatementRoute() {
  const supplierId = usePanelSupplierId();
  const { mes, de, ate } = Route.useSearch();
  const search = useMemo(() => ({ mes, de, ate }), [mes, de, ate]);
  const navigate = useNavigate({ from: Route.fullPath });
  // The clock of the page's first render: "today" for a partial month and the future-month cap.
  const [now] = useState(() => new Date());
  const period = useMemo(() => resolveReportPeriod(search, now), [search, now]);
  const onPeriodChange = useCallback(
    (next: ReportPeriodSearch) => void navigate({ search: periodSearchOf(next), replace: true }),
    [navigate],
  );
  return (
    <SupplierStatementPage
      supplierId={supplierId}
      search={search}
      period={period}
      onPeriodChange={onPeriodChange}
    />
  );
}
