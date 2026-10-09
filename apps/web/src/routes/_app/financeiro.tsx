import type { OrderFinancialRow, SalesSummary } from "@sellbridge/db/repositories";
import { formatCents } from "@sellbridge/shared/money";
import {
  financialSearchSchema,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  orderStatusSchema,
  type FinancialSearch,
  type FinancialSortKey,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { PaginationBar } from "@/components/data/pagination-bar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodFilters } from "@/components/reports/period-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { financialExportUrl, financialsQueryOptions } from "@/features/reports/reports.queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

const ALL_STATUSES = "__all__";

export const Route = createFileRoute("/_app/financeiro")({
  validateSearch: financialSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    prefetchOnServer(context.queryClient, financialsQueryOptions(deps)),
  head: () => ({ meta: [{ title: "Financeiro | SellBridge" }] }),
  component: FinancialPage,
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function useFinancialNavigation() {
  const navigate = useNavigate({ from: Route.fullPath });
  return useCallback(
    (patch: Partial<FinancialSearch>) =>
      void navigate({ search: (previous) => ({ ...previous, page: 1, ...patch }), replace: true }),
    [navigate],
  );
}

function SortIcon({ isActive, direction }: { isActive: boolean; direction: "asc" | "desc" }) {
  if (!isActive) {
    return <ArrowUpDown className="size-3.5" aria-hidden="true" />;
  }
  if (direction === "desc") {
    return <ArrowDown className="size-3.5" aria-hidden="true" />;
  }
  return <ArrowUp className="size-3.5" aria-hidden="true" />;
}

function sortStateLabel(isActive: boolean, direction: "asc" | "desc"): string {
  if (!isActive) {
    return "";
  }
  return direction === "desc" ? " (ordem decrescente)" : " (ordem crescente)";
}

function SortableHeader({
  field,
  label,
  align,
}: {
  field: FinancialSortKey;
  label: string;
  align?: "right";
}) {
  const search = Route.useSearch();
  const updateSearch = useFinancialNavigation();
  const isActive = search.sort === field;
  const nextDirection = isActive && search.dir === "desc" ? "asc" : "desc";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground",
        align === "right" && "ml-auto",
      )}
      aria-label={`Ordenar por ${label.toLowerCase()}${sortStateLabel(isActive, search.dir)}`}
      onClick={() => updateSearch({ sort: field, dir: nextDirection })}
    >
      {label}
      <SortIcon isActive={isActive} direction={search.dir} />
    </button>
  );
}

function statusLabel(status: string): string {
  const parsed = orderStatusSchema.safeParse(status);
  return parsed.success ? ORDER_STATUS_LABELS[parsed.data] : status;
}

function Money({ cents, emphasize = false }: { cents: number; emphasize?: boolean }) {
  return (
    <span
      className={cn(
        "block text-right whitespace-nowrap tabular-nums",
        emphasize && "font-semibold",
        emphasize && cents < 0 && "text-destructive",
      )}
    >
      {formatCents(cents)}
    </span>
  );
}

const columnHelper = createServerColumnHelper<OrderFinancialRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("orderedAt", {
    header: () => <SortableHeader field="orderedAt" label="Data" />,
    cell: (info) => (
      <span className="whitespace-nowrap">{dateFormatter.format(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("externalOrderId", {
    header: "Pedido",
    cell: (info) => (
      <div className="min-w-44 space-y-0.5">
        <p className="font-medium">{info.getValue()}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{info.row.original.items}</p>
        <p className="text-xs text-muted-foreground">{info.row.original.storeName}</p>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: () => <SortableHeader field="status" label="Status" />,
    cell: (info) => (
      <Badge variant="outline" className="whitespace-nowrap">
        {statusLabel(info.getValue())}
      </Badge>
    ),
  }),
  columnHelper.accessor("revenueCents", {
    header: () => <SortableHeader field="revenue" label="Receita" align="right" />,
    cell: (info) => <Money cents={info.getValue()} />,
  }),
  columnHelper.display({
    id: "costs",
    header: () => <span className="block text-right">Custos e taxas</span>,
    cell: (info) => {
      const row = info.row.original;
      const total = row.costCents + row.feeCents + row.platformFeeCents;
      return <Money cents={total === 0 ? 0 : -total} />;
    },
  }),
  columnHelper.display({
    id: "adjustments",
    header: () => <span className="block text-right">Ajustes</span>,
    cell: (info) => {
      const row = info.row.original;
      const total = row.commissionCents - row.refundCents;
      if (total === 0 && row.returnCents === 0) {
        return <span className="block text-right text-muted-foreground">—</span>;
      }
      return (
        <div className="space-y-0.5 text-right text-xs">
          {row.commissionCents > 0 ? <p>+{formatCents(row.commissionCents)} comissão</p> : null}
          {row.refundCents > 0 ? <p>−{formatCents(row.refundCents)} reembolso</p> : null}
          {row.returnCents > 0 ? (
            <p className="text-muted-foreground">{formatCents(row.returnCents)} devolvido</p>
          ) : null}
        </div>
      );
    },
  }),
  columnHelper.accessor("profitCents", {
    header: () => <SortableHeader field="profit" label="Lucro" align="right" />,
    cell: (info) => <Money cents={info.getValue()} emphasize />,
  }),
]);

function FinancialPage() {
  const search = Route.useSearch();
  const updateSearch = useFinancialNavigation();
  const query = useQuery(financialsQueryOptions(search));

  const header = (
    <PageHeader
      title="Financeiro"
      description="Lucro, comissões, devoluções e reembolsos por pedido e por período."
      actions={
        <Button asChild variant="outline">
          <a href={financialExportUrl(search)} download>
            <Download aria-hidden="true" />
            Exportar CSV
          </a>
        </Button>
      }
    />
  );

  if (query.isPending) {
    return (
      <>
        {header}
        <div className="space-y-4" aria-busy="true" aria-label="Carregando financeiro">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
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

  const { summary, orders, stores, period } = query.data;
  return (
    <>
      {header}
      <PeriodFilters
        search={search}
        stores={stores}
        resolvedFrom={period.fromDate}
        resolvedTo={period.toDate}
        onChange={updateSearch}
      />
      <SummaryCards summary={summary} />
      <OrderFilters />
      {orders.items.length === 0 ? (
        <FinancialEmptyState hasFilters={search.q !== undefined || search.status !== undefined} />
      ) : (
        <DataTable
          columns={columns}
          data={orders.items}
          getRowId={(row) => row.id}
          caption="Financeiro por pedido"
          footer={
            <PaginationBar
              page={orders.page}
              totalPages={orders.totalPages}
              total={orders.total}
              itemLabel="pedidos"
              onPageChange={(page) => updateSearch({ page })}
            />
          }
        />
      )}
    </>
  );
}

function SummaryCards({ summary }: { summary: SalesSummary }) {
  const items = [
    { label: "Lucro líquido", cents: summary.profitCents, emphasize: true },
    { label: "Receita", cents: summary.revenueCents },
    { label: "Custo dos produtos", cents: summary.costCents },
    { label: "Taxas", cents: summary.feeCents + summary.platformFeeCents },
    { label: "Comissões recebidas", cents: summary.commissionCents },
    { label: "Reembolsos", cents: summary.refundCents },
    { label: "Devoluções", cents: summary.returnCents },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumo do período</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-7">
          {items.map((item) => (
            <div key={item.label} className="space-y-1">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd
                className={cn(
                  "font-semibold tabular-nums",
                  item.emphasize && "text-lg",
                  item.emphasize && item.cents < 0 && "text-destructive",
                )}
              >
                {formatCents(item.cents)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function OrderFilters() {
  const search = Route.useSearch();
  const updateSearch = useFinancialNavigation();
  const [term, setTerm] = useState(search.q ?? "");
  const debouncedTerm = useDebouncedValue(term, 300);

  useEffect(() => {
    const q = debouncedTerm.trim().length > 0 ? debouncedTerm.trim() : undefined;
    if (q === search.q) {
      return;
    }
    updateSearch({ q });
  }, [debouncedTerm, search.q, updateSearch]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Buscar pedido"
          placeholder="Buscar por pedido, comprador ou produto"
          className="pl-9"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
      </div>
      <Select
        value={search.status ?? ALL_STATUSES}
        onValueChange={(value) =>
          updateSearch({ status: ORDER_STATUSES.find((status) => status === value) })
        }
      >
        <SelectTrigger className="sm:w-56" aria-label="Filtrar por status do pedido">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUSES}>Todos os status</SelectItem>
          {ORDER_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FinancialEmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <EmptyState
        icon={Search}
        title="Nenhum pedido encontrado"
        description="Nenhum pedido corresponde à busca ou ao status escolhido neste período."
      />
    );
  }
  return (
    <EmptyState
      icon={Wallet}
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
