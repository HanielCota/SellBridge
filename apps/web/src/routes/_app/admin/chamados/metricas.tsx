import type { SupportMetrics } from "@sellbridge/database/repositories";
import { supportMetricsSearchSchema, TICKET_CATEGORY_LABELS } from "@sellbridge/shared/schemas";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { SegmentedControl } from "@/components/data/segmented-control";
import { ErrorState } from "@/components/feedback/error-state";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { RatingStars } from "@/components/support/ticket-rating";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/features/support/response-time";
import { supportMetricsQueryOptions } from "@/features/support/support.queries";
import { errorMessage } from "@/lib/errors";
import { formatPercent } from "@/lib/percent";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/admin/chamados/metricas")({
  validateSearch: supportMetricsSearchSchema,
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "support.metrics")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, supportMetricsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Métricas do suporte | SellBridge" }] }),
  component: SupportMetricsPage,
});

const PERIOD_OPTIONS = ["7", "30", "90"] as const;
type Period = (typeof PERIOD_OPTIONS)[number];
const PERIOD_LABELS: Record<Period, string> = { "7": "7 dias", "30": "30 dias", "90": "90 dias" };

const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Same anatomy as the dashboard's KPI tiles: label, 30px figure, small caption. */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card flex min-h-36 flex-col justify-between gap-3 rounded-3xl bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="space-y-1.5">
        <p className="flex h-9 items-end text-[30px] leading-none font-semibold tabular-nums">
          {value}
        </p>
        {hint ? <p className="min-h-4 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function OverviewTiles({ metrics }: { metrics: SupportMetrics }) {
  const firstResponse =
    metrics.averageFirstResponseMinutes === null
      ? "—"
      : formatDuration(metrics.averageFirstResponseMinutes * 60_000);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Tile label="Chamados novos" value={String(metrics.opened)} hint="no período" />
      <Tile label="Encerrados" value={String(metrics.closed)} hint="no período" />
      <Tile
        label="Aguardando o suporte"
        value={String(metrics.openNow)}
        hint={`${metrics.overdueNow} fora do prazo agora`}
      />
      <Tile label="Primeira resposta" value={firstResponse} hint="tempo médio" />
      <Tile
        label="Respondidos no prazo"
        value={metrics.withinTargetRate === null ? "—" : formatPercent(metrics.withinTargetRate)}
        hint="primeira resposta dentro do prazo da prioridade"
      />
      <Tile
        label="Satisfação"
        value={
          metrics.averageRating === null ? "—" : `${decimal.format(metrics.averageRating)} / 5`
        }
        hint={`${metrics.ratings} ${metrics.ratings === 1 ? "avaliação" : "avaliações"}`}
      />
    </div>
  );
}

function TeamTable({ metrics }: { metrics: SupportMetrics }) {
  if (metrics.byAgent.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ninguém na equipe de suporte ainda. Defina o cargo de atendente ou supervisor na ficha do
        usuário.
      </p>
    );
  }
  return (
    <div className="surface-card overflow-x-auto rounded-3xl bg-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Desempenho por pessoa da equipe</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-5 py-3 font-medium">
              Pessoa
            </th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Em aberto
            </th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Encerrados
            </th>
            <th scope="col" className="px-5 py-3 text-right font-medium">
              Respostas
            </th>
            <th scope="col" className="px-5 py-3 font-medium">
              Satisfação
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.byAgent.map((agent) => (
            <tr key={agent.agentId} className="border-b last:border-0">
              <th scope="row" className="px-5 py-3 text-left font-medium">
                {agent.agentName}
              </th>
              <td className="px-5 py-3 text-right tabular-nums">{agent.assignedOpen}</td>
              <td className="px-5 py-3 text-right tabular-nums">{agent.closed}</td>
              <td className="px-5 py-3 text-right tabular-nums">{agent.replies}</td>
              <td className="px-5 py-3">
                {agent.averageRating === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <RatingStars rating={Math.round(agent.averageRating)} />
                    <span className="tabular-nums text-muted-foreground">
                      {decimal.format(agent.averageRating)}
                    </span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryList({ metrics }: { metrics: SupportMetrics }) {
  if (metrics.byCategory.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum chamado no período.</p>;
  }
  const top = Math.max(...metrics.byCategory.map((row) => row.total));
  return (
    <ul className="surface-card space-y-3 rounded-3xl bg-card p-5">
      {metrics.byCategory.map((row) => (
        <li key={row.category} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>{TICKET_CATEGORY_LABELS[row.category]}</span>
            <span className="tabular-nums text-muted-foreground">{row.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(row.total / top) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SupportMetricsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(supportMetricsQueryOptions(search));
  const period = PERIOD_OPTIONS.find((option) => option === String(search.days)) ?? "30";

  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink to="/admin/chamados" label="Chamados" />}
        title="Métricas do suporte"
        description="Volume, tempo de resposta e satisfação, no geral e por pessoa."
        actions={
          <SegmentedControl
            legend="Período"
            options={PERIOD_OPTIONS}
            labels={PERIOD_LABELS}
            value={period}
            onChange={(next) => void navigate({ search: { days: Number(next) }, replace: true })}
          />
        }
      />
      {query.isPending ? (
        <Skeleton className="h-64 rounded-3xl" aria-label="Carregando métricas" />
      ) : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {query.data ? (
        <>
          <OverviewTiles metrics={query.data} />
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="space-y-3">
              <h2 className="font-semibold">Equipe</h2>
              <TeamTable metrics={query.data} />
            </section>
            <section className="space-y-3">
              <h2 className="font-semibold">Temas mais pedidos</h2>
              <CategoryList metrics={query.data} />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
