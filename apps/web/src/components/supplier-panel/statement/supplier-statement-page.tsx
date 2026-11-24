import { ReceiptIcon } from "@phosphor-icons/react";
import { ESCROW_RELEASE_DELAY_IN_DAYS } from "@sellbridge/shared/escrow-release";
import { reportPeriodLabel, type ReportPeriod } from "@sellbridge/shared/report-period";
import type { ReportPeriodSearch } from "@sellbridge/shared/schemas";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PeriodControls } from "@/components/report-kit/period-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  supplierStatementLinesQueryOptions,
  supplierStatementTotalsQueryOptions,
} from "@/features/supplier-panel/statement/supplier-statement.queries";
import { errorMessage } from "@/lib/errors";
import { StatementLines } from "./statement-lines";
import { StatementSummary } from "./statement-summary";

interface SupplierStatementPageProps {
  supplierId: string;
  search: ReportPeriodSearch;
  period: ReportPeriod;
  onPeriodChange: (search: ReportPeriodSearch) => void;
}

/** "Novembro de 2026" inside a sentence reads "novembro de 2026". */
function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

function StatementSkeleton() {
  return (
    <output
      className="block max-w-3xl space-y-4"
      aria-busy="true"
      aria-label="Carregando o extrato"
    >
      <Skeleton className="h-72 rounded-3xl" />
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-32 rounded-2xl" />
      ))}
    </output>
  );
}

function TotalsSection(props: SupplierStatementPageProps) {
  const query = useQuery(supplierStatementTotalsQueryOptions(props.supplierId, props.search));
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) {
    return <Skeleton className="h-72 max-w-3xl rounded-3xl" />;
  }
  // An empty period shows only the empty state below: a box of zeros says nothing.
  if (query.data.orders === 0 && query.data.returnedOrders === 0) {
    return null;
  }
  return <StatementSummary totals={query.data} />;
}

function LinesSection(props: SupplierStatementPageProps) {
  const query = useInfiniteQuery(
    supplierStatementLinesQueryOptions(props.supplierId, props.search),
  );
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) {
    return <StatementSkeleton />;
  }
  const lines = query.data.pages.flatMap((page) => page.lines);
  if (lines.length === 0) {
    return (
      <EmptyState
        icon={ReceiptIcon}
        title={`Nenhum pedido pago em ${lowerFirst(reportPeriodLabel(props.period))}`}
        description="Quando um revendedor pagar um pedido seu, ele aparece aqui com o valor, as taxas e o dia em que o dinheiro libera."
      />
    );
  }
  const estimated = lines.some((line) => line.asaasFeeEstimated);
  return (
    <div className="space-y-3">
      <StatementLines lines={lines} />
      {estimated ? (
        <p className="max-w-3xl text-xs text-muted-foreground">
          “cerca de”: o Asaas ainda não informou a tarifa desse pedido, então mostramos a tarifa
          padrão dele. Quando ele informar, aparece o valor exato.
        </p>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="h-11 w-full max-w-3xl"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Carregando..." : "Mostrar mais pedidos"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The supplier's statement: every order a reseller paid through SellBridge in the period, what
 * SellBridge and Asaas keep, what is left for the supplier and when the money is released.
 */
export function SupplierStatementPage(props: SupplierStatementPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Extrato"
        description={`Cada pedido que os revendedores pagaram a você pelo SellBridge: o valor dos seus produtos (o frete não entra), os 4% do SellBridge, a tarifa do Asaas e quanto fica para você. O dinheiro fica guardado e é liberado ${ESCROW_RELEASE_DELAY_IN_DAYS} dias depois da entrega.`}
      />
      <PeriodControls period={props.period} onChange={props.onPeriodChange} />
      <TotalsSection {...props} />
      <LinesSection {...props} />
    </div>
  );
}
