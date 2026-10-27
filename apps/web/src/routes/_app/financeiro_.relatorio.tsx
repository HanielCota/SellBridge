import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import { reportPeriodSearchSchema, type ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import type { DownloadOption } from "@/components/report-kit/download-menu";
import { MonthlyReportPage } from "@/components/report-kit/monthly-report-page";
import {
  sellerReportQueryOptions,
  sellerReportSpreadsheetUrl,
} from "@/features/reports/seller-report.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { useTabProfileLink } from "@/lib/tab-profile";

export const Route = createFileRoute("/_app/financeiro_/relatorio")({
  validateSearch: reportPeriodSearchSchema,
  loaderDeps: ({ search }) => periodSearchOf(search),
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, sellerReportQueryOptions(search)),
  head: () => ({ meta: [{ title: "Relatório de vendas | SellBridge" }] }),
  component: SellerReportPage,
});

/** Only the report's own params: another month replaces `mes`, `de` and `ate` together. */
function periodSearchOf(search: ReportPeriodSearch): ReportPeriodSearch {
  return { mes: search.mes, de: search.de, ate: search.ate };
}

function SellerReportPage() {
  const search = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const withProfile = useTabProfileLink();
  const query = useQuery(sellerReportQueryOptions(periodSearchOf(search)));
  // The clock of the page's first render: "today" for a partial month and the future-month cap.
  const [now] = useState(() => new Date());
  const period = useMemo(() => resolveReportPeriod(search, now), [search, now]);
  const onPeriodChange = useCallback(
    (next: ReportPeriodSearch) => void navigate({ search: periodSearchOf(next), replace: true }),
    [navigate],
  );
  const spreadsheets: DownloadOption[] = [
    {
      kind: "spreadsheet",
      label: "Planilha dos pedidos",
      description: "Cada pedido do período em CSV, com receita, custo, taxas e lucro",
      href: withProfile(sellerReportSpreadsheetUrl(period)),
    },
  ];
  return (
    <MonthlyReportPage
      title="Relatório de vendas"
      back={{ to: "/financeiro", label: "Financeiro" }}
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
