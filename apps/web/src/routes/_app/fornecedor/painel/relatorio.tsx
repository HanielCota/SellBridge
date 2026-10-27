import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import { reportPeriodSearchSchema, type ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { MonthlyReportPage } from "@/components/report-kit/monthly-report-page";
import { useSupplierSpreadsheets } from "@/components/supplier-panel/report/supplier-download-menu";
import { supplierReportQueryOptions } from "@/features/supplier-panel/report/supplier-report.queries";
import { usePanelSupplierId } from "@/features/supplier-panel/use-panel-supplier";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/fornecedor/painel/relatorio")({
  validateSearch: reportPeriodSearchSchema,
  head: () => ({ meta: [{ title: "Relatório do fornecedor | Painel do fornecedor" }] }),
  component: SupplierReportPage,
});

/** Only the report's own params: another month replaces `mes`, `de` and `ate` together. */
function periodSearchOf(search: ReportPeriodSearch): ReportPeriodSearch {
  return { mes: search.mes, de: search.de, ate: search.ate };
}

function SupplierReportPage() {
  const supplierId = usePanelSupplierId();
  const search = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(supplierReportQueryOptions(supplierId, periodSearchOf(search)));
  // The clock of the page's first render: "today" for a partial month and the future-month cap.
  const [now] = useState(() => new Date());
  const period = useMemo(() => resolveReportPeriod(search, now), [search, now]);
  const spreadsheets = useSupplierSpreadsheets(period);
  const onPeriodChange = useCallback(
    (next: ReportPeriodSearch) => void navigate({ search: periodSearchOf(next), replace: true }),
    [navigate],
  );
  return (
    <MonthlyReportPage
      title="Relatório do fornecedor"
      back={{ to: "/fornecedor/painel/desempenho", label: "Desempenho" }}
      period={period}
      onPeriodChange={onPeriodChange}
      query={{
        data: query.data,
        isPending: query.isPending,
        isError: query.isError,
        error: query.error,
        isPlaceholderData: query.isPlaceholderData,
        refetch: query.refetch,
        errorMessage: errorMessage(query.error),
      }}
      spreadsheets={spreadsheets}
      generatedBy={session.user.name}
    />
  );
}
