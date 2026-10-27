import { reportPeriodSearchOf, resolveReportPeriod } from "@sellbridge/shared/report-period";
import { reportPeriodSearchSchema, type ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import type { DownloadOption } from "@/components/report-kit/download-menu";
import { MonthlyReportPage } from "@/components/report-kit/monthly-report-page";
import { ReportTeam } from "@/components/report-kit/report-team";
import { adminExportHref } from "@/features/admin-report/admin-download-links";
import { CREDIT_RULE } from "@/features/admin-report/admin-report-rules";
import { adminReportQueryOptions } from "@/features/admin-report/admin-report.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { useTabProfileLink } from "@/lib/tab-profile";

/** The month of the support and the team, for the coordination: same access as "Desempenho". */
export const Route = createFileRoute("/_app/admin/relatorio")({
  validateSearch: reportPeriodSearchSchema,
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "support.metrics")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  loaderDeps: ({ search }) => periodSearchOf(search),
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, adminReportQueryOptions(search)),
  head: () => ({ meta: [{ title: "Relatório do suporte e da equipe | SellBridge" }] }),
  component: AdminReportPage,
});

/** Only the report's own params: another month replaces `mes`, `de` and `ate` together. */
function periodSearchOf(search: ReportPeriodSearch): ReportPeriodSearch {
  return { mes: search.mes, de: search.de, ate: search.ate };
}

function AdminReportPage() {
  const search = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const withProfile = useTabProfileLink();
  const query = useQuery(adminReportQueryOptions(periodSearchOf(search)));
  // The clock of the page's first render: "today" for a partial month and the future-month cap.
  const [now] = useState(() => new Date());
  // One switch for the screen and the files: hidden names are "Atendente N" in both.
  const [showNames, setShowNames] = useState(true);
  const period = useMemo(() => resolveReportPeriod(search, now), [search, now]);
  const onPeriodChange = useCallback(
    (next: ReportPeriodSearch) => void navigate({ search: periodSearchOf(next), replace: true }),
    [navigate],
  );
  const periodSearch = reportPeriodSearchOf(period);
  const spreadsheets: DownloadOption[] = [
    {
      kind: "spreadsheet",
      label: "Planilha da equipe",
      description: "Uma linha por pessoa: produção, prazo e notas",
      href: withProfile(adminExportHref("equipe", periodSearch, showNames)),
    },
    {
      kind: "spreadsheet",
      label: "Planilha dos chamados",
      description: "Um chamado por linha, sem contato do cliente",
      href: withProfile(adminExportHref("chamados", periodSearch, showNames)),
    },
  ];
  const team = query.data?.report.team;
  return (
    <MonthlyReportPage
      title="Relatório do suporte e da equipe"
      back={{ to: "/admin/chamados/metricas", label: "Desempenho do suporte" }}
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
      team={
        team ? (
          <ReportTeam
            rows={team}
            showNames={showNames}
            onShowNamesChange={setShowNames}
            creditRule={CREDIT_RULE}
          />
        ) : null
      }
      teamNames={{ checked: showNames, onChange: setShowNames }}
    />
  );
}
