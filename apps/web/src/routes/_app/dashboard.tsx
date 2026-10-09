import {
  financialSearchSchema,
  periodSearchSchema,
  type PeriodSearch,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { CashFlowChart } from "@/components/dashboard/cash-flow-chart";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-sm text-muted-foreground">
        {formatDateRange(data.period.fromDate, data.period.toDate)} · comparado com os{" "}
        {data.period.days} dias anteriores
      </p>
      <PeriodFilters
        search={search}
        stores={data.stores}
        resolvedFrom={data.period.fromDate}
        resolvedTo={data.period.toDate}
        onChange={updateSearch}
      />
    </div>
  );
}

function DashboardPage() {
  const query = useDashboardQuery();
  if (query.isError) {
    return (
      <>
        <DashboardHero stats={null} />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (query.isPending) {
    return (
      <>
        <DashboardHero stats={null} />
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
        <DashboardHero stats={null} />
        <SetupGuide progress={onboarding} />
      </>
    );
  }
  return (
    <>
      <DashboardHero
        stats={{
          profitCents: summary.profitCents,
          revenue: { current: summary.revenueCents, previous: previous.revenueCents },
          orders: { current: summary.orders, previous: previous.orders },
        }}
      />
      <DashboardFilters data={data} />
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
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando visão geral">
      <Skeleton className="h-9 w-full max-w-lg rounded-lg" />
      <div className="rounded-2xl border bg-card">
        <div className="grid grid-cols-2 border-b lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="space-y-2 px-5 py-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="m-5 h-64 rounded-lg sm:h-72" />
      </div>
    </div>
  );
}
