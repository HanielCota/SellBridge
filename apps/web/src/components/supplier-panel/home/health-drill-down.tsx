import {
  HEALTH_METRIC_LABELS,
  HEALTH_WINDOW_DAYS,
  type HealthMetricKey,
} from "@sellbridge/shared/supplier-panel-health";
import { StarIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { SmartDate } from "@/components/data/smart-date";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { healthDrillDownQueryOptions } from "@/features/supplier-panel/home/home.queries";

/** What each row means for each metric, said once above the list. */
const DRILL_DOWN_CAPTIONS: Record<HealthMetricKey, string> = {
  accept_on_time: "Pedidos aceitos depois do prazo de aceite.",
  dispatch_on_time: "Pedidos despachados depois do prazo de despacho.",
  supplier_cancellations: "Pedidos que você cancelou.",
  average_rating: "Avaliações de 3 estrelas ou menos.",
};

function DrillDownRows({ supplierId, metric }: { supplierId: string; metric: HealthMetricKey }) {
  const query = useQuery(healthDrillDownQueryOptions(supplierId, metric));
  // A failed background refresh keeps the numbers already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <ErrorState
        message="Não foi possível carregar os pedidos desta métrica."
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.data === undefined) {
    return <Skeleton className="h-24 rounded-2xl" aria-label="Carregando pedidos" />;
  }
  if (query.data.length === 0) {
    return (
      <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhum pedido pesou contra esta métrica nos últimos {HEALTH_WINDOW_DAYS} dias.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {query.data.map((row) => (
        <li
          key={`${row.orderId}-${row.at.toISOString()}`}
          className="flex items-center justify-between gap-3 py-2.5 text-sm"
        >
          <span className="min-w-0 truncate font-medium tabular-nums">
            Pedido {row.externalOrderId}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            {row.rating === null ? null : (
              <span className="inline-flex items-center gap-1 font-medium text-foreground tabular-nums">
                <StarIcon weight="fill" className="size-3.5 text-amber-500" aria-hidden="true" />
                {row.rating}
              </span>
            )}
            <SmartDate date={row.at} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The orders behind one metric, so a number can always be checked against real orders. */
export function HealthDrillDown({
  supplierId,
  metric,
}: {
  supplierId: string;
  metric: HealthMetricKey;
}) {
  return (
    <section
      aria-labelledby="health-drill-down-title"
      className="surface-card rounded-3xl bg-card p-5 sm:p-6"
    >
      <h2 id="health-drill-down-title" className="text-subhead font-semibold">
        O que pesou em {HEALTH_METRIC_LABELS[metric].toLowerCase()}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{DRILL_DOWN_CAPTIONS[metric]}</p>
      <div className="mt-4">
        <DrillDownRows supplierId={supplierId} metric={metric} />
      </div>
    </section>
  );
}
