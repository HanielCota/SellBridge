import { CaretRightIcon } from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import { HEALTH_METRIC_LABELS } from "@sellbridge/shared/supplier-panel-health";
import type { SupplierOrderTab } from "@sellbridge/shared/supplier-panel-orders-tabs";
import type { SupplierLabelState } from "@sellbridge/shared/supplier-order-labels";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ToneStatus } from "@/components/data/tone-status";
import { ErrorState } from "@/components/feedback/error-state";
import { BreakdownSection } from "@/components/reports/breakdown-section";
import {
  cancellationWarning,
  formatMonth,
  formatOrders,
  formatShareDetail,
  formatShareRate,
  lateDispatchWarning,
  monthsFromFirstSale,
  type ShareWarning,
} from "@/features/supplier-panel/operation/operation-format";
import type { SupplierOperationSearch } from "@/features/supplier-panel/operation/operation-search";
import {
  supplierOperationQueryOptions,
  type SupplierOperationData,
} from "@/features/supplier-panel/operation/operation.queries";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "../performance/performance-format";

const count = new Intl.NumberFormat("pt-BR");

function Figure({
  label,
  value,
  detail,
  warning = null,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: ShareWarning | null;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      {warning === null ? null : (
        <dd>
          <ToneStatus tone={warning.tone} label={warning.label} />
        </dd>
      )}
      <dd className="text-xs text-muted-foreground">{detail}</dd>
    </div>
  );
}

function dispatchTimeDetail(dispatchedParcels: number): string {
  if (dispatchedParcels === 0) {
    return "Nenhum envio no período";
  }
  const noun = dispatchedParcels === 1 ? "envio" : "envios";
  return `Média de ${count.format(dispatchedParcels)} ${noun}, da chegada do pedido até sair`;
}

/** Late and cancelled parcels, the dispatch time and the resellers of the period. */
function OperationRatesCard({
  rates,
  resellers,
}: {
  rates: SupplierOperationData["rates"];
  resellers: number;
}) {
  const average = rates.averageDispatchMilliseconds;
  return (
    <BreakdownSection
      title="Sua operação no período"
      to="/fornecedor/painel/desempenho"
      hint="Ver seu desempenho"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        <Figure
          label="Envios atrasados"
          value={formatShareRate(rates.lateDispatches)}
          warning={lateDispatchWarning(rates.lateDispatches)}
          detail={formatShareDetail(rates.lateDispatches, {
            one: "envio",
            many: "envios",
            none: "Nenhum prazo de envio venceu",
          })}
        />
        <Figure
          label={HEALTH_METRIC_LABELS.supplier_cancellations}
          value={formatShareRate(rates.supplierCancellations)}
          warning={cancellationWarning(rates.supplierCancellations)}
          detail={formatShareDetail(rates.supplierCancellations, {
            one: "pedido",
            many: "pedidos",
            none: "Nenhum pedido enviado ou cancelado",
          })}
        />
        <Figure
          label="Tempo até enviar"
          value={average === null ? "—" : formatDuration(average)}
          detail={dispatchTimeDetail(rates.dispatchedParcels)}
        />
        <Figure
          label="Revendedores ativos"
          value={count.format(resellers)}
          detail="Venderam seus produtos no período"
        />
      </dl>
    </BreakdownSection>
  );
}

interface NowRow {
  key: string;
  label: string;
  value: number;
  /** Late rows turn red with a word beside the count, never color alone. */
  late: boolean;
  search: { tab: SupplierOrderTab; label?: SupplierLabelState };
}

function nowRows(now: SupplierOperationData["now"]): NowRow[] {
  return [
    {
      key: "waiting",
      label: "Pedidos esperando você",
      value: now.waiting,
      late: false,
      search: { tab: "todo" },
    },
    {
      key: "late",
      label: "Pedidos atrasados",
      value: now.late,
      late: true,
      search: { tab: "problem" },
    },
    {
      key: "labels",
      label: "Etiquetas para imprimir",
      value: now.labelsToPrint,
      late: false,
      search: { tab: "todo", label: "pending" },
    },
    {
      key: "labels-late",
      label: "Etiquetas em atraso",
      value: now.labelsLate,
      late: true,
      search: { tab: "todo", label: "late" },
    },
  ];
}

/** What waits for the supplier right now, whatever the period: each row opens it on Pedidos. */
function OperationNowCard({ now }: { now: SupplierOperationData["now"] }) {
  return (
    <BreakdownSection
      title="Para fazer agora"
      to="/fornecedor/painel/pedidos"
      hint="Ver todos os pedidos"
      wholeCardLinks={false}
    >
      <ul className="-my-1 divide-y text-sm">
        {nowRows(now).map((row) => (
          <li key={row.key}>
            <Link
              to="/fornecedor/painel/pedidos"
              search={row.search}
              className="flex min-h-11 items-center justify-between gap-3 rounded-md py-1 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {row.late && row.value > 0 ? (
                <ToneStatus tone="danger" label={row.label} />
              ) : (
                <span className="text-muted-foreground">{row.label}</span>
              )}
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{count.format(row.value)}</span>
                <CaretRightIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </BreakdownSection>
  );
}

/** What the supplier receives in each month of the period, newest first. */
function MonthlyRevenueCard({ months }: { months: SupplierOperationData["months"] }) {
  const sold = monthsFromFirstSale(months);
  return (
    <BreakdownSection
      title="Faturamento por mês"
      to="/fornecedor/painel/vendas"
      hint="Ver suas vendas"
    >
      {sold.length > 0 ? (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            O que você recebe. O primeiro e o último mês contam só os dias do período.
          </p>
          <ol className="-my-1 divide-y text-sm" aria-label="Faturamento de cada mês">
            {sold.toReversed().map((month) => (
              <li key={month.date} className="flex items-center justify-between gap-3 py-2">
                <span className="space-y-0.5">
                  <span className="block font-medium">{formatMonth(month.date)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatOrders(month.orders)}
                  </span>
                </span>
                <span className="font-medium tabular-nums">
                  {formatCents(month.receivableCents)}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma venda no período. Quando seus produtos venderem, o valor de cada mês aparece aqui.
        </p>
      )}
    </BreakdownSection>
  );
}

/** The home's operation row: the period's rates, what waits now and the months' revenue. */
export function SupplierOperation({
  supplierId,
  search,
}: {
  supplierId: string;
  search: SupplierOperationSearch;
}) {
  const query = useQuery(supplierOperationQueryOptions(supplierId, search));
  // A failed background refresh keeps the numbers already on screen.
  if (query.isError && query.data === undefined) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) {
    return (
      <output
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        aria-busy="true"
        aria-label="Carregando sua operação"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-80 rounded-3xl" />
        ))}
      </output>
    );
  }
  return (
    <div
      aria-busy={query.isPlaceholderData}
      className={cn(
        "grid grid-cols-1 gap-4 transition-opacity lg:grid-cols-3",
        query.isPlaceholderData && "opacity-60",
      )}
    >
      <OperationRatesCard rates={query.data.rates} resellers={query.data.resellers} />
      <OperationNowCard now={query.data.now} />
      <MonthlyRevenueCard months={query.data.months} />
    </div>
  );
}
