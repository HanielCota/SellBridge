import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import {
  FINANCIAL_SORTS,
  financialSearchSchema,
  type FinancialSearch,
  type OrderStage,
  type Paginated,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadSimpleIcon, MagnifyingGlassIcon, WalletIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { FilterTabs } from "@/components/data/filter-tabs";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodFilters } from "@/components/reports/period-filters";
import { type DayTotal, OrderStatement } from "@/components/financials/order-statement";
import { ProfitSummary } from "@/components/financials/profit-summary";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateRange } from "@/features/reports/dashboard-metrics";
import { financialExportUrl, financialsQueryOptions } from "@/features/reports/reports.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";

export const Route = createFileRoute("/_app/financeiro")({
  validateSearch: financialSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps: search }) =>
    prefetchOnServer(context.queryClient, financialsQueryOptions(search)),
  head: () => ({ meta: [{ title: "Financeiro | SellBridge" }] }),
  component: FinancialPage,
});

function useFinancialNavigation() {
  const navigate = useNavigate({ from: Route.fullPath });
  return useCallback(
    (patch: Partial<FinancialSearch>) =>
      void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true }),
    [navigate],
  );
}

const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"] as const;

function FinancialPage() {
  return (
    <>
      <FinancialHeader />
      <FinancialContent />
    </>
  );
}

function FinancialHeader() {
  const search = Route.useSearch();
  return (
    <PageHeader
      title="Financeiro"
      description="Lucro por pedido e por período."
      actions={
        <Button asChild variant="outline">
          <a href={financialExportUrl(search)} download>
            <DownloadSimpleIcon aria-hidden="true" />
            Exportar CSV
          </a>
        </Button>
      }
    />
  );
}

function FinancialContent() {
  const search = Route.useSearch();
  const updateSearch = useFinancialNavigation();
  const query = useQuery(financialsQueryOptions(search));

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Carregando financeiro">
        <Skeleton className="h-64 rounded-3xl" />
        <div className="space-y-px overflow-hidden rounded-3xl">
          {SKELETON_ROWS.map((key) => (
            <Skeleton key={key} className="h-[68px] rounded-none" />
          ))}
        </div>
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { summary, previous, days, orders, stores, period } = query.data;
  const hasFilters = search.query !== undefined || search.stage !== undefined;
  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-muted-foreground">
          {formatDateRange(period.fromDate, period.toDate)}
        </p>
        <PeriodFilters
          search={search}
          stores={stores}
          resolvedFrom={period.fromDate}
          resolvedTo={period.toDate}
          onChange={updateSearch}
        />
      </div>
      <ProfitSummary summary={summary} previous={previous} />
      <section aria-labelledby="extrato-heading" className="space-y-4 pt-2">
        <OrderFilters />
        <FinancialOrders
          orders={orders}
          hasFilters={hasFilters}
          // A narrowed list would not add up to the whole day, so its headings go without totals.
          dayTotals={hasFilters ? null : new Map(days.map((day) => [day.date, day]))}
          byDay={search.sort === "orderedAt"}
          showStore={stores.length > 1}
          onPageChange={(page) => updateSearch({ page })}
        />
      </section>
    </>
  );
}

function FinancialOrders({
  orders,
  hasFilters,
  dayTotals,
  byDay,
  showStore,
  onPageChange,
}: {
  readonly orders: Paginated<OrderFinancialRow>;
  readonly hasFilters: boolean;
  readonly dayTotals: ReadonlyMap<string, DayTotal> | null;
  readonly byDay: boolean;
  readonly showStore: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  if (orders.items.length === 0) {
    return <FinancialEmptyState hasFilters={hasFilters} />;
  }
  return (
    <div className="space-y-4">
      <OrderStatement
        rows={orders.items}
        dayTotals={dayTotals}
        byDay={byDay}
        showStore={showStore}
      />
      <PaginationBar
        page={orders.page}
        totalPages={orders.totalPages}
        total={orders.total}
        itemLabel={{ one: "pedido", other: "pedidos" }}
        onPageChange={onPageChange}
      />
    </div>
  );
}

/**
 * Where an order is in shipping is the Pedidos page's business; here only what changes the money
 * gets its own tab. The other stages still work from the URL.
 */
const STAGE_TABS: readonly { value: OrderStage | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "issue", label: "Cancelados e devolvidos" },
];

const SORT_OPTIONS = [
  { key: "orderedAt:desc", label: "Mais recentes" },
  { key: "orderedAt:asc", label: "Mais antigos" },
  { key: "profit:desc", label: "Maior lucro" },
  { key: "profit:asc", label: "Menor lucro" },
  { key: "revenue:desc", label: "Maior valor" },
] as const;

function SortSelect() {
  const search = Route.useSearch();
  const updateSearch = useFinancialNavigation();
  const current = `${search.sort}:${search.direction}`;
  const label = SORT_OPTIONS.find((option) => option.key === current)?.label ?? "Ordenar";
  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const [sort, direction] = value.split(":");
        const parsedSort = FINANCIAL_SORTS.find((option) => option === sort);
        if (!parsedSort || (direction !== "asc" && direction !== "desc")) {
          return;
        }
        updateSearch({ sort: parsedSort, direction });
      }}
    >
      <SelectTrigger className="shrink-0 sm:w-44" aria-label="Ordenar pedidos">
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {SORT_OPTIONS.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The statement's title with its tools beside it: what to show, in which order, and a search. */
function OrderFilters() {
  const search = Route.useSearch();
  const updateSearch = useFinancialNavigation();
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query }),
  });

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <h2 id="extrato-heading" className="text-xl font-semibold tracking-tight">
        Extrato
      </h2>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterTabs
          legend="Filtrar por etapa do pedido"
          tabs={STAGE_TABS}
          value={search.stage}
          onChange={(stage) => updateSearch({ stage })}
        />
        <div className="flex gap-2">
          <SortSelect />
          <SearchInput
            label="Buscar pedido"
            placeholder="Buscar pedido"
            className="flex-1 sm:w-56 sm:flex-none"
            value={term}
            onValueChange={setTerm}
          />
        </div>
      </div>
    </div>
  );
}

function FinancialEmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <EmptyState
        icon={MagnifyingGlassIcon}
        title="Nenhum pedido encontrado"
        description="Tente outra busca, outra etapa ou outro período."
      />
    );
  }
  return (
    <EmptyState
      icon={WalletIcon}
      title="Ainda não há movimentações"
      description="Quando seus produtos publicados venderem, lucro, comissões, devoluções e reembolsos aparecem aqui, pedido a pedido."
      action={
        <Button asChild>
          <Link to="/publicacoes">Ver publicações</Link>
        </Button>
      }
    />
  );
}
