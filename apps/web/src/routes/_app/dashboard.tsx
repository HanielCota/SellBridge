import { formatCents } from "@sellbridge/shared/money";
import { periodSearchSchema, type PeriodSearch } from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Circle,
  DollarSign,
  PiggyBank,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/reports/kpi-card";
import { PeriodFilters } from "@/components/reports/period-filters";
import { RevenueChart } from "@/components/reports/revenue-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardQueryOptions } from "@/features/reports/reports.queries";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/dashboard")({
  validateSearch: periodSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => prefetchOnServer(context.queryClient, dashboardQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Dashboard | SellBridge" }] }),
  component: DashboardPage,
});

type DashboardData = NonNullable<ReturnType<typeof useDashboardQuery>["data"]>;

function useDashboardQuery() {
  const search = Route.useSearch();
  return useQuery(dashboardQueryOptions(search));
}

function DashboardPage() {
  const { session } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useDashboardQuery();

  function updateSearch(patch: Partial<PeriodSearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }

  const header = (
    <PageHeader
      title={`Olá, ${session.user.name.split(" ")[0] ?? session.user.name}`}
      description="Acompanhe vendas, lucro e o desempenho das suas lojas."
    />
  );

  if (query.isPending) {
    return (
      <>
        {header}
        <DashboardSkeleton />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </>
    );
  }

  const data = query.data;
  return (
    <>
      {header}
      <PeriodFilters
        search={search}
        stores={data.stores}
        resolvedFrom={data.period.fromDate}
        resolvedTo={data.period.toDate}
        onChange={updateSearch}
      />
      <DashboardContent data={data} />
    </>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  const { onboarding } = data;
  const onboardingComplete =
    onboarding.hasRegion && onboarding.hasStore && onboarding.hasPublishedListing;
  if (!onboardingComplete && data.summary.orders === 0 && data.summary.cancelledOrders === 0) {
    return <OnboardingChecklist onboarding={onboarding} />;
  }
  return (
    <div className="space-y-6">
      <KpiGrid data={data} />
      <Card>
        <CardHeader>
          <CardTitle>Evolução de receita e lucro</CardTitle>
          <CardDescription>
            {data.period.bucket === "week" ? "Por semana" : "Por dia"} · comparado ao período
            anterior de mesmo tamanho nos indicadores acima
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.summary.orders === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Nenhuma venda neste período"
              description="Escolha outro período ou outra loja para ver a evolução."
            />
          ) : (
            <RevenueChart points={data.timeseries} bucket={data.period.bucket} />
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <StoreBreakdownCard data={data} />
        <TopProductsCard data={data} />
      </div>
    </div>
  );
}

function KpiGrid({ data }: { data: DashboardData }) {
  const { summary, previous } = data;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Vendas"
        icon={ShoppingBag}
        value={summary.orders.toLocaleString("pt-BR")}
        current={summary.orders}
        previous={previous.orders}
        hint={
          summary.cancelledOrders > 0
            ? `${summary.cancelledOrders} canceladas/devolvidas`
            : undefined
        }
      />
      <KpiCard
        label="Receita"
        icon={DollarSign}
        value={formatCents(summary.revenueCents)}
        current={summary.revenueCents}
        previous={previous.revenueCents}
      />
      <KpiCard
        label="Lucro"
        icon={PiggyBank}
        value={formatCents(summary.profitCents)}
        current={summary.profitCents}
        previous={previous.profitCents}
      />
      <KpiCard
        label="Ticket médio"
        icon={Receipt}
        value={summary.averageTicketCents === null ? "—" : formatCents(summary.averageTicketCents)}
        current={summary.averageTicketCents ?? 0}
        previous={previous.averageTicketCents}
      />
    </div>
  );
}

function StoreBreakdownCard({ data }: { data: DashboardData }) {
  const maxRevenue = Math.max(1, ...data.byStore.map((store) => store.revenueCents));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendas por loja</CardTitle>
      </CardHeader>
      <CardContent>
        {data.byStore.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
        ) : (
          <ul className="space-y-4">
            {data.byStore.map((store) => (
              <li key={store.storeConnectionId} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{store.storeName}</span>
                  <span className="tabular-nums">{formatCents(store.revenueCents)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-sky-600 dark:bg-sky-400"
                    style={{ width: `${Math.round((store.revenueCents / maxRevenue) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {store.orders} vendas · lucro {formatCents(store.profitCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TopProductsCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Produtos mais vendidos</CardTitle>
      </CardHeader>
      <CardContent>
        {data.topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
        ) : (
          <ol className="divide-y">
            {data.topProducts.map((product, index) => (
              <li key={product.title} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{product.title}</span>
                <span className="shrink-0 text-muted-foreground">{product.units} un.</span>
                <span className="w-24 shrink-0 text-right tabular-nums">
                  {formatCents(product.revenueCents)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
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
                  <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-label="Concluído" />
                ) : (
                  <Circle className="mt-0.5 size-5 text-muted-foreground" aria-label="Pendente" />
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
    <div className="space-y-6" aria-busy="true" aria-label="Carregando dashboard">
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
