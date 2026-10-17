import type { HealthMetricKey } from "@sellbridge/shared/supplier-panel-health";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierPerformanceQueryOptions } from "@/features/supplier-panel/home/home.queries";
import { HealthDrillDown } from "./health-drill-down";
import { HealthMetricList } from "./health-metric-list";
import { HealthThermometer } from "./health-thermometer";

interface SupplierPerformanceProps {
  supplierId: string;
  /** The metric to open, e.g. from a link of the home; dispatch otherwise. */
  initialMetric?: HealthMetricKey | undefined;
}

const HEADER = <PageHeader title="Desempenho" />;

function PerformanceSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-44 rounded-3xl" aria-label="Carregando desempenho" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-96 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    </div>
  );
}

/**
 * Body of the "Desempenho" page: the overall thermometer next to the public score, every
 * metric against its target, and the orders behind the chosen one, so no number is a mystery.
 */
export function SupplierPerformance({ supplierId, initialMetric }: SupplierPerformanceProps) {
  const query = useQuery(supplierPerformanceQueryOptions(supplierId));
  const [metric, setMetric] = useState<HealthMetricKey>(initialMetric ?? "dispatch_on_time");
  // A failed background refresh keeps the numbers already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="space-y-6">
        {HEADER}
        <ErrorState
          message="Não foi possível carregar o Desempenho, tente de novo."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div className="space-y-6">
        {HEADER}
        <PerformanceSkeleton />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {HEADER}
      <div className="space-y-4">
        <HealthThermometer health={query.data.health} reputation={query.data.reputation} />
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <HealthMetricList
            metrics={query.data.health.metrics}
            selected={metric}
            onSelect={setMetric}
          />
          <HealthDrillDown supplierId={supplierId} metric={metric} />
        </div>
      </div>
    </div>
  );
}
