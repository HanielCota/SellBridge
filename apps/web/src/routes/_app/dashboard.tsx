import {
  financialSearchSchema,
  periodSearchSchema,
  type PeriodSearch,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { CashFlowChart } from "@/components/reports/cash-flow-chart";
import { DashboardHeader, ProfitSpotlight } from "@/components/reports/dashboard-hero";
import { KpiTiles } from "@/components/reports/kpi-tiles";
import { PeriodSummary } from "@/components/reports/period-summary";
import { ErrorState } from "@/components/feedback/error-state";
import { AttentionPanel } from "@/components/reports/attention-panel";
import { PeriodFilters } from "@/components/reports/period-filters";
import { StoreBreakdown, TopProducts } from "@/components/reports/sales-breakdown";
import { SetupGuide } from "@/components/onboarding/setup-guide";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateRange } from "@/features/reports/dashboard-metrics";
import { dashboardQueryOptions, financialExportUrl } from "@/features/reports/reports.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/dashboard")({
  validateSearch: periodSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, dashboardQueryOptions(search)),
  head: () => ({ meta: [{ title: "Visão geral | SellBridge" }] }),
  component: DashboardPage,
});

type DashboardData = NonNullable<ReturnType<typeof useDashboardQuery>["data"]>;

function useDashboardQuery() {
  const search = Route.useSearch();
  return useQuery(dashboardQueryOptions(search));
}

function DashboardFilters({ data }: { data: DashboardData }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function updateSearch(patch: Partial<PeriodSearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }
  return (
    <PeriodFilters
      search={search}
      stores={data.stores}
      resolvedFrom={data.period.fromDate}
      resolvedTo={data.period.toDate}
      onChange={updateSearch}
    />
  );
}

function DashboardPage() {
  const query = useDashboardQuery();
  if (query.isError) {
    return (
      <>
        <DashboardHeader />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (query.isPending) {
    return (
      <>
        <DashboardHeader />
        <DashboardSkeleton />
      </>
    );
  }
  return (
    <div
      aria-busy={query.isPlaceholderData}
      className={cn("space-y-6 transition-opacity", query.isPlaceholderData && "opacity-60")}
    >
      <DashboardContent data={query.data} />
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  const search = Route.useSearch();
  const { onboarding, summary, previous } = data;
  const onboardingComplete =
    onboarding.hasRegion && onboarding.hasStore && onboarding.hasPublishedListing;
  if (!onboardingComplete && summary.orders === 0 && summary.cancelledOrders === 0) {
    return (
      <>
        <DashboardHeader />
        <SetupGuide progress={onboarding} />
      </>
    );
  }
  return (
    <>
      <DashboardHeader
        caption={`${formatDateRange(data.period.fromDate, data.period.toDate)} · comparado com os ${data.period.days} dias anteriores`}
        filters={<DashboardFilters data={data} />}
      />
      <ProfitSpotlight
        current={summary}
        previous={previous}
        summary={
          <PeriodSummary
            current={summary}
            previous={previous}
            points={data.timeseries}
            bucket={data.period.bucket}
            className="max-w-xl text-lg"
          />
        }
      />
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <KpiTiles
          caption={formatDateRange(data.period.fromDate, data.period.toDate)}
          summary={summary}
          previous={previous}
          points={data.timeseries}
        />
        <CashFlowChart
          points={data.timeseries}
          bucket={data.period.bucket}
          exportUrl={financialExportUrl(financialSearchSchema.parse(search))}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <StoreBreakdown stores={data.byStore} />
        <TopProducts products={data.topProducts} />
        <AttentionPanel stores={data.stores} />
      </div>
    </>
  );
}

function DashboardSkeleton() {
  // Same sizes as the loaded layout, so nothing jumps when the data arrives.
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando visão geral">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-full max-w-md rounded-full" />
      </div>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-44 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-[394px] rounded-3xl sm:h-[426px]" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-3xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
