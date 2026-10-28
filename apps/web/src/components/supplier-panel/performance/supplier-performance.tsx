import type { HealthMetricKey } from "@sellbridge/shared/supplier-panel-health";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierPerformanceQueryOptions } from "@/features/supplier-panel/performance/performance.queries";
import type { SupplierPerformanceData } from "@/features/supplier-panel/performance/performance-types";
import { PerformanceMetricStrip } from "./performance-metric-strip";
import { PerformanceOrders } from "./performance-orders";
import { PerformanceOverview } from "./performance-overview";
import { PerformanceReviews } from "./performance-reviews";

interface SupplierPerformanceProps {
  supplierId: string;
  /** The metric to open, e.g. from a link of the home; dispatch otherwise. */
  initialMetric?: HealthMetricKey | undefined;
  /** The header's actions (the page's "Baixar"). */
  headerActions?: ReactNode;
}

function PerformanceSkeleton() {
  return (
    <output
      className="block space-y-px overflow-hidden rounded-2xl"
      aria-busy="true"
      aria-label="Carregando desempenho"
    >
      <Skeleton className="h-24 rounded-none" />
      <Skeleton className="h-28 rounded-none" />
      <Skeleton className="h-72 rounded-none" />
    </output>
  );
}

function PerformanceCard({
  supplierId,
  data,
  initialMetric,
}: {
  supplierId: string;
  data: SupplierPerformanceData;
  initialMetric: HealthMetricKey;
}) {
  const [selected, setSelected] = useState<HealthMetricKey>(initialMetric);
  const metric = data.health.metrics.find((candidate) => candidate.key === selected);
  return (
    <section
      aria-label="Seu desempenho"
      className="surface-card overflow-hidden rounded-2xl bg-card pb-1.5"
    >
      <PerformanceOverview health={data.health} reputation={data.reputation} />
      <PerformanceMetricStrip
        metrics={data.health.metrics}
        selected={selected}
        onSelect={setSelected}
      />
      {metric === undefined ? null : (
        <PerformanceOrders
          supplierId={supplierId}
          metric={metric}
          facts={data.facts[metric.key]}
          deadlines={data.deadlines}
        />
      )}
      <PerformanceReviews reviews={data.reviews} />
    </section>
  );
}

/**
 * Body of the "Desempenho" page in the supplier home's language: one card with the account's
 * color and public score on top, a strip of the five metrics, the orders behind the chosen one
 * and the reviews in numbers, so no figure is a mystery.
 */
export function SupplierPerformance({
  supplierId,
  initialMetric,
  headerActions,
}: SupplierPerformanceProps) {
  const header = <PageHeader title="Desempenho" actions={headerActions} />;
  const query = useQuery(supplierPerformanceQueryOptions(supplierId));
  // A failed background refresh keeps the numbers already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          message="Não foi possível carregar o Desempenho, tente de novo."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {header}
      {query.data === undefined ? (
        <PerformanceSkeleton />
      ) : (
        <PerformanceCard
          supplierId={supplierId}
          data={query.data}
          initialMetric={initialMetric ?? "dispatch_on_time"}
        />
      )}
    </div>
  );
}
