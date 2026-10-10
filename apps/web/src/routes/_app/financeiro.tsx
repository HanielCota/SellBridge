import type { OrderFinancialRow, SalesSummary } from "@sellbridge/database/repositories";
import { formatCents } from "@sellbridge/shared/money";
import {
  financialSearchSchema,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type FinancialSearch,
  type FinancialSortKey,
  type Paginated,
} from "@sellbridge/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DownloadSimpleIcon, MagnifyingGlassIcon, WalletIcon } from "@phosphor-icons/react";
import { useCallback } from "react";
import { createServerColumnHelper, DataTable } from "@/components/data/data-table";
import { Money } from "@/components/data/money";
import { PaginationBar } from "@/components/data/pagination-bar";
import { SearchInput } from "@/components/data/search-input";
import { SortableHeader } from "@/components/data/sortable-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodFilters } from "@/components/reports/period-filters";
import { OrderStatusBadge } from "@/components/reports/order-status-badge";
import { Button } from "@/components/ui/button";
import { SmartDate } from "@/components/data/smart-date";
import { displayStoreName } from "@/features/stores/store-name";
import { MoneyFigure } from "@/components/reports/figures";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateRange } from "@/features/reports/dashboard-metrics";
import {
  orderAdjustments,
  orderCostsCents,
  type OrderAdjustmentKind,
} from "@/features/reports/financial-rows";
import { financialExportUrl, financialsQueryOptions } from "@/features/reports/reports.queries";
import { useUrlSearchQuery } from "@/hooks/use-url-search-query";
import { errorMessage } from "@/lib/errors";
import { prefetchOnServer } from "@/lib/prefetch";
import { cn } from "@/lib/utils";

const ALL_STATUSES = "__all__";

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

function FinancialSortHeader({
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
  return (
    <SortableHeader
      label={label}
      isActive={search.sort === field}
      direction={search.direction}
      onSort={(direction) => updateSearch({ sort: field, direction })}
      align={align}
    />
  );
}

const ADJUSTMENT_LINES: Record<
  OrderAdjustmentKind,
  { sign: string; label: string; className?: string }
> = {
  commission: { sign: "+", label: "comissão", className: "text-brand-text" },
  refund: { sign: "−", label: "reembolso" },
  return: { sign: "", label: "devolvido", className: "text-muted-foreground" },
};

function AdjustmentsCell({ row }: { row: OrderFinancialRow }) {
  const adjustments = orderAdjustments(row);
  if (adjustments.length === 0) {
    return <span className="block text-right text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-0.5 text-right text-xs">
      {adjustments.map((adjustment) => {
        const line = ADJUSTMENT_LINES[adjustment.kind];
        return (
          <p key={adjustment.kind} className={line.className}>
            {line.sign}
            {formatCents(adjustment.cents)} {line.label}
          </p>
        );
      })}
    </div>
  );
}

const columnHelper = createServerColumnHelper<OrderFinancialRow>();

const columns = columnHelper.columns([
  columnHelper.accessor("orderedAt", {
    header: () => <FinancialSortHeader field="orderedAt" label="Data" />,
    cell: (info) => <SmartDate date={info.getValue()} className="whitespace-nowrap" />,
  }),
  columnHelper.accessor("externalOrderId", {
    header: "Pedido",
    cell: (info) => (
      <div className="min-w-44 space-y-0.5">
        <p className="font-medium">{info.getValue()}</p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{info.row.original.items}</p>
        <p className="text-xs text-muted-foreground">
          {displayStoreName(info.row.original.storeName)}
        </p>
      </div>
    ),
  }),
  columnHelper.accessor("status", {
    header: () => <FinancialSortHeader field="status" label="Status" />,
    cell: (info) => <OrderStatusBadge status={info.getValue()} />,
  }),
  columnHelper.accessor("revenueCents", {
    header: () => <FinancialSortHeader field="revenue" label="Receita" align="right" />,
    cell: (info) => <Money cents={info.getValue()} />,
  }),
  columnHelper.display({
    id: "costs",
    header: () => <span className="block text-right">Custos e taxas</span>,
    cell: (info) => <Money cents={orderCostsCents(info.row.original)} muted />,
  }),
  columnHelper.display({
    id: "adjustments",
    header: () => <span className="block text-right">Ajustes</span>,
    cell: (info) => <AdjustmentsCell row={info.row.original} />,
  }),
  columnHelper.accessor("profitCents", {
    header: () => <FinancialSortHeader field="profit" label="Lucro" align="right" />,
    cell: (info) => <Money cents={info.getValue()} emphasize />,
  }),
]);

/** An order as a card on phones: when, what, and the profit it left. */
function MobileOrderRow({ row }: { row: OrderFinancialRow }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{row.externalOrderId}</p>
          <p className="line-clamp-1 text-xs text-muted-foreground">{row.items}</p>
        </div>
        <Money cents={row.profitCents} emphasize />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <SmartDate date={row.orderedAt} />
          <span className="truncate">· {displayStoreName(row.storeName)}</span>
        </span>
        <OrderStatusBadge status={row.status} />
      </div>
    </div>
  );
}

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
      description="Lucro, comissões, devoluções e reembolsos por pedido e por período."
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
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { summary, orders, stores, period } = query.data;
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
      <SummaryCards summary={summary} />
      <OrderFilters />
      <FinancialOrders
        orders={orders}
        hasFilters={search.query !== undefined || search.status !== undefined}
        onPageChange={(page) => updateSearch({ page })}
      />
    </>
  );
}

function FinancialOrders({
  orders,
  hasFilters,
  onPageChange,
}: {
  readonly orders: Paginated<OrderFinancialRow>;
  readonly hasFilters: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  if (orders.items.length === 0) {
    return <FinancialEmptyState hasFilters={hasFilters} />;
  }
  return (
    <DataTable
      columns={columns}
      data={orders.items}
      getRowId={(row) => row.id}
      caption="Financeiro por pedido"
      renderMobileRow={(row) => <MobileOrderRow row={row} />}
      footer={
        <PaginationBar
          page={orders.page}
          totalPages={orders.totalPages}
          total={orders.total}
          itemLabel={{ one: "pedido (todos os status)", other: "pedidos (todos os status)" }}
          onPageChange={onPageChange}
        />
      }
    />
  );
}

const marginFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Money with a real minus sign (or a plus for income), so signs line up and read as math. */
function signedCents(cents: number): string {
  if (cents < 0) {
    return `−${formatCents(-cents)}`;
  }
  return cents > 0 ? `+${formatCents(cents)}` : formatCents(0);
}

/** Share of revenue as a short label; tiny non-zero shares read "<1%" instead of "0%". */
function shareLabel(ratio: number): string {
  if (ratio > 0 && ratio < 0.01) {
    return "<1%";
  }
  return `${Math.round(ratio * 100)}%`;
}

interface BreakdownLine {
  label: string;
  /** Signed: negative leaves the revenue, positive adds to it. */
  cents: number;
  /** Background utility shared by the dot, the bar and the composition segment. */
  color: string;
}

function breakdownLines(summary: SalesSummary): BreakdownLine[] {
  const lines: BreakdownLine[] = [
    { label: "Custo dos produtos", cents: -summary.costCents, color: "bg-finance-cost" },
    {
      label: "Taxas do marketplace",
      cents: -(summary.feeCents + summary.platformFeeCents),
      color: "bg-finance-fee",
    },
    { label: "Reembolsos", cents: -summary.refundCents, color: "bg-finance-refund" },
  ];
  if (summary.commissionCents !== 0) {
    lines.push({ label: "Comissões recebidas", cents: summary.commissionCents, color: "bg-brand" });
  }
  return lines;
}

/**
 * The profit on its own, then the arithmetic behind it: one bar splits every real sold into
 * where it went, and the list beside it spells out each line in the same colors.
 */
function SummaryCards({ summary }: { summary: SalesSummary }) {
  const lines = breakdownLines(summary);
  return (
    <section
      aria-label="Resumo do período"
      className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
    >
      <ProfitCard summary={summary} lines={lines} />
      <BreakdownList summary={summary} lines={lines} />
    </section>
  );
}

interface Segment {
  key: string;
  cents: number;
  color: string;
}

function profitSegments(profit: number, lines: readonly BreakdownLine[]): Segment[] {
  return [
    ...lines
      .filter((line) => line.cents < 0)
      .map((line) => ({ key: line.label, cents: -line.cents, color: line.color })),
    { key: "Lucro", cents: Math.max(profit, 0), color: "bg-brand" },
  ].filter((segment) => segment.cents > 0);
}

function ProfitHeadline({ revenue, profit }: { revenue: number; profit: number }) {
  const isLoss = profit < 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-sm font-medium", isLoss ? "text-destructive" : "text-brand-text")}>
          {isLoss ? "Prejuízo no período" : "Lucro líquido"}
          <span className="sr-only">: {formatCents(profit)}</span>
        </p>
        {revenue > 0 ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
              isLoss ? "bg-destructive/10 text-destructive" : "bg-brand/10 text-brand-text",
            )}
          >
            {marginFormat.format(profit / revenue)} de margem
          </span>
        ) : null}
      </div>
      <MoneyFigure
        cents={profit}
        withCents
        className={cn("text-[52px] leading-none", isLoss && "text-destructive")}
      />
    </div>
  );
}

function ProfitComposition({
  revenue,
  profit,
  segments,
}: {
  revenue: number;
  profit: number;
  segments: readonly Segment[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.cents, 0);
  if (total === 0) {
    return null;
  }
  const keptPerReal = revenue > 0 ? Math.max(profit, 0) / revenue : 0;
  return (
    <div className="space-y-2.5">
      <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={cn("h-full", segment.color)}
            style={{ width: `${(segment.cents / total) * 100}%` }}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {profit < 0 ? (
          <>As saídas superaram a receita em {formatCents(-profit)}.</>
        ) : (
          <>
            De cada R$ 1,00 vendido,{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatCents(Math.round(keptPerReal * 100))}
            </span>{" "}
            ficaram com você.
          </>
        )}
      </p>
    </div>
  );
}

function ProfitCard({
  summary,
  lines,
}: {
  summary: SalesSummary;
  lines: readonly BreakdownLine[];
}) {
  const revenue = summary.revenueCents;
  const profit = summary.profitCents;
  return (
    <div
      className={cn(
        "surface-card flex flex-col gap-6 rounded-3xl p-6",
        profit < 0 ? "bg-card" : "bg-brand/[0.045] ring-1 ring-brand/15 ring-inset",
      )}
    >
      <ProfitHeadline revenue={revenue} profit={profit} />
      <ProfitComposition
        revenue={revenue}
        profit={profit}
        segments={profitSegments(profit, lines)}
      />
      <div className="mt-auto space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        <p>
          {summary.orders} {summary.orders === 1 ? "pedido válido" : "pedidos válidos"}
          {summary.cancelledOrders > 0
            ? ` · ${summary.cancelledOrders} cancelados ou devolvidos`
            : ""}
        </p>
        {summary.returnCents > 0 ? (
          <p title="Pedidos devolvidos não entram na receita nem no lucro">
            {formatCents(summary.returnCents)} em devoluções, já fora da receita
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BreakdownList({
  summary,
  lines,
}: {
  summary: SalesSummary;
  lines: readonly BreakdownLine[];
}) {
  const revenue = summary.revenueCents;
  const isLoss = summary.profitCents < 0;
  return (
    <dl className="surface-card flex flex-col justify-between gap-4 rounded-3xl bg-card p-6">
      <BreakdownRow
        label="Receita"
        value={formatCents(revenue)}
        ratio={revenue > 0 ? 1 : 0}
        color="bg-foreground/55"
        emphasis
      />
      {lines.map((line) => {
        const ratio = revenue > 0 ? Math.abs(line.cents) / revenue : 0;
        return (
          <BreakdownRow
            key={line.label}
            label={line.label}
            value={signedCents(line.cents)}
            share={revenue > 0 ? shareLabel(ratio) : undefined}
            ratio={ratio}
            color={line.color}
          />
        );
      })}
      <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <dt className={cn("text-sm font-medium", isLoss ? "text-destructive" : "text-brand-text")}>
          {isLoss ? "Prejuízo" : "Lucro líquido"}
        </dt>
        <dd
          className={cn(
            "text-lg font-semibold tracking-tight tabular-nums",
            isLoss ? "text-destructive" : "text-brand-text",
          )}
        >
          {formatCents(summary.profitCents)}
        </dd>
      </div>
    </dl>
  );
}

function BreakdownRow({
  label,
  value,
  share,
  ratio,
  color,
  emphasis = false,
}: {
  label: string;
  value: string;
  share?: string | undefined;
  ratio: number;
  color: string;
  emphasis?: boolean;
}) {
  return (
    // A group inside a <dl> may only hold <dt> and <dd>: the bar is a hidden grid cell, not a wrapper.
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 text-sm">
      <dt
        className={cn(
          "flex min-w-0 items-center gap-2",
          emphasis ? "font-medium" : "text-muted-foreground",
        )}
      >
        {emphasis ? null : (
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", color)} />
        )}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="shrink-0 font-semibold tracking-tight tabular-nums">
        {value}
        {share ? (
          <span className="ml-2 inline-block w-9 text-right text-xs font-normal text-muted-foreground">
            {share}
          </span>
        ) : null}
      </dd>
      <span aria-hidden="true" className="col-span-2 block h-1 rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", color)}
          style={{ width: `${Math.min(Math.max(ratio * 100, ratio > 0 ? 1.5 : 0), 100)}%` }}
        />
      </span>
    </div>
  );
}

function OrderFilters() {
  const search = Route.useSearch();
  const updateSearch = useFinancialNavigation();
  const { term, setTerm } = useUrlSearchQuery({
    urlQuery: search.query,
    commitQuery: (query) => updateSearch({ query }),
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchInput
        label="Buscar pedido"
        placeholder="Buscar por pedido, comprador ou produto"
        className="flex-1"
        value={term}
        onValueChange={setTerm}
      />
      <Select
        value={search.status ?? ALL_STATUSES}
        onValueChange={(value) =>
          updateSearch({ status: ORDER_STATUSES.find((status) => status === value) })
        }
      >
        <SelectTrigger className="sm:w-56" aria-label="Filtrar por status do pedido">
          <SelectValue>
            {search.status ? ORDER_STATUS_LABELS[search.status] : "Todos os status"}
          </SelectValue>
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
        icon={MagnifyingGlassIcon}
        title="Nenhum pedido encontrado"
        description="Tente outra busca, outro status ou outro período."
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
