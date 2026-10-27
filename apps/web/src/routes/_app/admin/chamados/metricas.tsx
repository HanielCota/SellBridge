import { supportMetricsSearchSchema } from "@sellbridge/shared/schemas";
import { hasStaffPermission } from "@sellbridge/shared/staff-access";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SupportAreaTabs } from "@/components/support-performance/support-area-tabs";
import {
  BoardView,
  PersonView,
  type SearchPatch,
} from "@/components/support-performance/performance-views";
import { supportPerformanceQueryOptions } from "@/features/support/support.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/chamados/metricas")({
  validateSearch: supportMetricsSearchSchema,
  beforeLoad: ({ context }) => {
    if (!hasStaffPermission(context.session.user.role, "support.metrics")) {
      throw redirect({ to: "/admin/chamados" });
    }
  },
  loaderDeps: ({ search }) => ({
    period: search.period,
    from: search.from,
    to: search.to,
    origem: search.origem,
  }),
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, supportPerformanceQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Desempenho do suporte | SellBridge" }] }),
  component: SupportPerformancePage,
});

function PerformanceSkeleton() {
  // Same sizes as the loaded overview, so nothing jumps when the figures arrive.
  return (
    <output className="block space-y-6" aria-busy="true" aria-label="Carregando o desempenho">
      <div className="space-y-3">
        <Skeleton className="h-12 w-96 max-w-full" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-6 w-full max-w-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-[38rem] rounded-3xl" />
      </div>
    </output>
  );
}

function MissingPersonNotice({ onBack }: { onBack: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
      Essa pessoa não aparece na equipe deste período.
      <button
        type="button"
        onClick={onBack}
        className="rounded font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Ver a equipe
      </button>
    </p>
  );
}

function SupportPerformancePage() {
  const search = Route.useSearch();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useQuery(
    supportPerformanceQueryOptions({
      period: search.period,
      from: search.from,
      to: search.to,
      origem: search.origem,
    }),
  );

  function updateSearch(patch: SearchPatch) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }

  const report = query.data;
  const agent = report?.team.find((member) => member.id === search.pessoa);
  return (
    <div className="space-y-6">
      <SupportAreaTabs role={session.user.role} current="desempenho" />
      {query.isPending ? <PerformanceSkeleton /> : null}
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : null}
      {report ? (
        <div
          aria-busy={query.isPlaceholderData}
          className={cn("space-y-6 transition-opacity", query.isPlaceholderData && "opacity-60")}
        >
          {search.pessoa !== undefined && agent === undefined ? (
            <MissingPersonNotice onBack={() => updateSearch({ pessoa: undefined })} />
          ) : null}
          {agent ? (
            <PersonView
              report={report}
              search={search}
              onChange={updateSearch}
              agent={agent}
              canReassign={hasStaffPermission(session.user.role, "support.assign_others")}
            />
          ) : (
            <BoardView report={report} search={search} onChange={updateSearch} />
          )}
        </div>
      ) : null}
    </div>
  );
}
