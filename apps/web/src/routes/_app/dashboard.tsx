import { periodSearchSchema, type PeriodSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { CheckCircleIcon, CircleIcon, TrendUpIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PeriodFilters } from "@/components/reports/period-filters";
import { AttentionPanel } from "@/components/reports/attention-panel";
import { Briefing } from "@/components/reports/briefing";
import { MetricsRibbon } from "@/components/reports/metrics-ribbon";
import { MoneyFlow } from "@/components/reports/money-flow";
import { RhythmChart } from "@/components/reports/rhythm-chart";
import { StoreBreakdown, TopProducts } from "@/components/reports/sales-breakdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bestPoint } from "@/features/reports/dashboard-insights";
import { formatDateRange } from "@/features/reports/dashboard-metrics";
import { dashboardQueryOptions } from "@/features/reports/reports.queries";
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

function DashboardHeader({ data }: { data: DashboardData | undefined }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  function updateSearch(patch: Partial<PeriodSearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          {data
            ? `${formatDateRange(data.period.fromDate, data.period.toDate)} · comparado com os ${data.period.days} dias anteriores`
            : "Carregando período…"}
        </p>
      </div>
      {data ? (
        <PeriodFilters
          search={search}
          stores={data.stores}
          resolvedFrom={data.period.fromDate}
          resolvedTo={data.period.toDate}
          onChange={updateSearch}
        />
      ) : null}
    </header>
  );
}

function DashboardPage() {
  const query = useDashboardQuery();
  if (query.isError) {
    return (
      <>
        <DashboardHeader data={undefined} />
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (query.isPending) {
    return (
      <>
        <DashboardHeader data={undefined} />
        <DashboardSkeleton />
      </>
    );
  }
  return (
    <>
      <DashboardHeader data={query.data} />
      <div
        aria-busy={query.isPlaceholderData}
        className={cn("transition-opacity", query.isPlaceholderData && "opacity-60")}
      >
        <DashboardContent data={query.data} />
      </div>
    </>
  );
}

const PRESET_PHRASES: Record<string, { period: string; comparison: string }> = {
  "7d": { period: "nos últimos 7 dias", comparison: "nos 7 dias anteriores" },
  "30d": { period: "nos últimos 30 dias", comparison: "nos 30 dias anteriores" },
  "90d": { period: "nos últimos 90 dias", comparison: "nos 90 dias anteriores" },
  "180d": { period: "nos últimos 6 meses", comparison: "nos 6 meses anteriores" },
};

function periodPhrases(preset: string) {
  return (
    PRESET_PHRASES[preset] ?? {
      period: "no período escolhido",
      comparison: "no período anterior de mesmo tamanho",
    }
  );
}

function SalesInsights({ data }: { data: DashboardData }) {
  const { summary, previous } = data;
  if (summary.orders === 0) {
    return (
      <section className="rounded-2xl border bg-card">
        <EmptyState
          icon={TrendUpIcon}
          title="Nenhuma venda neste período"
          description="Escolha outro período ou outra loja para ver o ritmo e para onde vai o dinheiro."
        />
      </section>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <RhythmChart
        points={data.timeseries}
        bucket={data.period.bucket}
        previousTotals={{
          profit: previous.profitCents,
          revenue: previous.revenueCents,
          orders: previous.orders,
        }}
      />
      <MoneyFlow summary={summary} />
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  const search = Route.useSearch();
  const { onboarding, summary, previous } = data;
  const onboardingComplete =
    onboarding.hasRegion && onboarding.hasStore && onboarding.hasPublishedListing;
  if (!onboardingComplete && summary.orders === 0 && summary.cancelledOrders === 0) {
    return <OnboardingChecklist onboarding={onboarding} />;
  }
  const phrases = periodPhrases(search.period);
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Briefing
          summary={summary}
          previous={previous}
          periodPhrase={phrases.period}
          comparisonPhrase={phrases.comparison}
          bestDay={bestPoint(data.timeseries, (point) => point.profitCents)}
          bucket={data.period.bucket}
        />
        <AttentionPanel stores={data.stores} />
      </div>
      <MetricsRibbon summary={summary} previous={previous} />
      <SalesInsights data={data} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <StoreBreakdown stores={data.byStore} />
        </div>
        <div className="lg:col-span-3">
          <TopProducts products={data.topProducts} />
        </div>
      </div>
    </div>
  );
}

const ONBOARDING_STEPS = [
  {
    key: "hasRegion",
    title: "Informe sua região",
    description: "Seu CEP define quais fornecedores entregam para você.",
    to: "/onboarding",
    cta: "Informar CEP",
  },
  {
    key: "hasStore",
    title: "Conecte uma loja",
    description: "Conecte sua loja no Mercado Livre, Shopee ou TikTok Shop.",
    to: "/lojas",
    cta: "Conectar loja",
  },
  {
    key: "hasPublishedListing",
    title: "Publique seu primeiro produto",
    description: "Escolha um produto de um fornecedor e publique nas suas lojas.",
    to: "/fornecedores",
    cta: "Ver fornecedores",
  },
] as const;

function OnboardingChecklist({ onboarding }: { onboarding: DashboardData["onboarding"] }) {
  const nextStep = ONBOARDING_STEPS.find((step) => !onboarding[step.key]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Primeiros passos</CardTitle>
        <CardDescription>
          Complete os passos abaixo. Assim que as vendas chegarem, seus indicadores aparecem aqui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {ONBOARDING_STEPS.map((step) => {
            const done = onboarding[step.key];
            const isNext = nextStep?.key === step.key;
            return (
              <li key={step.key} className="flex items-start gap-3">
                {done ? (
                  <CheckCircleIcon
                    className="mt-0.5 size-5 text-emerald-600"
                    aria-label="Concluído"
                  />
                ) : (
                  <CircleIcon
                    className="mt-0.5 size-5 text-muted-foreground"
                    aria-label="Pendente"
                  />
                )}
                <div className="flex-1 space-y-1">
                  <p
                    className={
                      done ? "font-medium text-muted-foreground line-through" : "font-medium"
                    }
                  >
                    {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
                {isNext ? (
                  <Button asChild size="sm">
                    <Link to={step.to}>{step.cta}</Link>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
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
