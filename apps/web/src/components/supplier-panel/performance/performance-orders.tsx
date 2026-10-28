import { CaretRightIcon, StarIcon } from "@phosphor-icons/react";
import { REVIEW_TAG_LABELS, reviewTagSchema } from "@sellbridge/shared/schemas";
import {
  HEALTH_METRIC_LABELS,
  healthForecastText,
  type HealthMetric,
} from "@sellbridge/shared/supplier-panel-health";
import type { HealthMetricFacts } from "@sellbridge/shared/supplier-panel-health-facts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { ErrorState } from "@/components/feedback/error-state";
import { DeltaBadge } from "@/components/reports/figures";
import { MarketplaceMark } from "@/components/stores/marketplace-mark";
import { Skeleton } from "@/components/ui/skeleton";
import type { PerformanceOrder } from "@/features/supplier-panel/performance/performance-types";
import { performanceOrdersQueryOptions } from "@/features/supplier-panel/performance/performance.queries";
import { cn } from "@/lib/utils";
import { HomePhoto } from "../home/home-list";
import { LEVEL_TEXT_CLASSES, sampleNote } from "../home/health-format";
import {
  againstCountLabel,
  orderOutcomeText,
  ordersTabOf,
  performanceFacts,
  seeAllLabel,
} from "./performance-format";

/** A long list stays scannable: the rest opens on "Ver os 9 pedidos". */
const VISIBLE_ROWS = 6;

/** What a short sample or a steady level says under the title instead of a forecast. */
const CAPTIONS: Record<HealthMetric["key"], string> = {
  accept_on_time: "Pedidos aceitos depois do prazo.",
  dispatch_on_time: "Pedidos despachados depois do prazo.",
  supplier_cancellations: "Pedidos que você cancelou.",
  supplier_returns: "Pedidos entregues que o comprador devolveu.",
  average_rating: "Avaliações de 3 estrelas ou menos.",
};

function groupHint(metric: HealthMetric): string {
  if (metric.level === "insufficient") {
    return `${sampleNote(metric)}. Até lá, nada conta contra você.`;
  }
  return healthForecastText(metric.key, metric.forecast) ?? CAPTIONS[metric.key];
}

/** The reasons a low review ticked, in words; unknown tags are skipped. */
function reasonsOf(tags: readonly string[]): string {
  const labels = tags.flatMap((tag) => {
    const parsed = reviewTagSchema.safeParse(tag);
    return parsed.success ? [REVIEW_TAG_LABELS[parsed.data]] : [];
  });
  return labels.join(", ");
}

function OrderOutcome({ metric, row }: { metric: HealthMetric; row: PerformanceOrder }) {
  if (row.rating !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-footnote font-medium tabular-nums">
        <StarIcon weight="fill" className="size-3.5 text-amber-500" aria-hidden="true" />
        {row.rating}
        <span className="sr-only">{row.rating === 1 ? "estrela" : "estrelas"}</span>
      </span>
    );
  }
  const late = row.lateByMilliseconds !== null;
  return (
    <span
      className={cn(
        "text-footnote font-medium whitespace-nowrap tabular-nums",
        late ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {orderOutcomeText(metric.key, row.lateByMilliseconds)}
    </span>
  );
}

function OrderDetail({ row }: { row: PerformanceOrder }) {
  const reasons = reasonsOf(row.tags);
  return (
    <>
      {row.marketplace === null ? null : (
        <MarketplaceMark marketplace={row.marketplace} className="size-4 rounded-[5px]" />
      )}
      <span className="truncate">
        {reasons === "" ? `Pedido ${row.externalOrderId}` : reasons} · <SmartDate date={row.at} />
      </span>
    </>
  );
}

/** One order: photo, product, store and order, the outcome on the right; opens it in Pedidos. */
function OrderRow({ metric, row }: { metric: HealthMetric; row: PerformanceOrder }) {
  const title = row.title ?? `Pedido ${row.externalOrderId}`;
  const outcome = <OrderOutcome metric={metric} row={row} />;
  return (
    <li>
      <Link
        to="/fornecedor/painel/pedidos"
        search={{
          tab: row.shipmentStatus === null ? "closed" : ordersTabOf(row.shipmentStatus),
          query: row.externalOrderId,
        }}
        className="grid grid-cols-[auto_minmax(0,1fr)_1rem] items-center gap-3.5 px-5 py-2.5 outline-none transition-[background-color,box-shadow] duration-100 hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:grid-cols-[auto_minmax(0,1fr)_auto_1rem]"
      >
        <HomePhoto imageUrl={row.imageUrl} title={title} quantity={row.units} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-footnote text-muted-foreground">
            <OrderDetail row={row} />
          </span>
          {/* On a phone the outcome drops under the name, so the name keeps the width. */}
          <span className="mt-1 block sm:hidden">{outcome}</span>
        </span>
        <span className="hidden justify-self-end sm:block">{outcome}</span>
        <CaretRightIcon className="size-4 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function OrderRows({ supplierId, metric }: { supplierId: string; metric: HealthMetric }) {
  const query = useQuery(performanceOrdersQueryOptions(supplierId, metric.key));
  const [expanded, setExpanded] = useState(false);
  // A failed background refresh keeps the orders already on screen.
  if (query.isError && query.data === undefined) {
    return (
      <div className="px-5 py-4">
        <ErrorState
          message="Não foi possível carregar os pedidos, tente de novo."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div className="space-y-2 px-5 py-3">
        {[0, 1, 2].map((index) => (
          <Skeleton
            key={index}
            className="h-13 rounded-xl"
            aria-label={index === 0 ? "Carregando pedidos" : undefined}
          />
        ))}
      </div>
    );
  }
  if (query.data.length === 0) {
    return (
      <p className="px-5 py-4 text-footnote text-muted-foreground">
        Nenhum pedido contou contra esta métrica nos últimos 60 dias.
      </p>
    );
  }
  const rows = expanded ? query.data : query.data.slice(0, VISIBLE_ROWS);
  const hidden = query.data.length - rows.length;
  return (
    <>
      <ul className="[&>li+li]:border-t [&>li+li]:border-border/60">
        {rows.map((row) => (
          <OrderRow key={`${row.orderId}-${row.at.toISOString()}`} metric={metric} row={row} />
        ))}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="block min-h-11 w-full cursor-pointer border-t border-border/60 px-5 text-left text-footnote font-medium text-brand-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          {seeAllLabel(metric.key, query.data.length)}
        </button>
      ) : null}
    </>
  );
}

interface PerformanceOrdersProps {
  supplierId: string;
  metric: HealthMetric;
  facts: HealthMetricFacts;
  deadlines: { acceptWithinHours: number | null; dispatchWithinHours: number | null };
}

/** The chosen metric as a group of the home list: title, count, forecast, figures, orders. */
export function PerformanceOrders({
  supplierId,
  metric,
  facts,
  deadlines,
}: PerformanceOrdersProps) {
  const offTarget = metric.level === "red" || metric.level === "yellow";
  const figures = performanceFacts({ metric, facts, deadlines });
  return (
    <section aria-labelledby="performance-orders-title">
      <div className="border-b border-border bg-foreground/[0.035] pb-3">
        <div className="flex min-h-8 items-center gap-2 px-5 pt-4 pb-1">
          <h2 id="performance-orders-title" className="text-[1.0625rem] font-semibold">
            {HEALTH_METRIC_LABELS[metric.key]}
          </h2>
          {facts.against > 0 ? (
            <span
              className={cn(
                "text-sm font-medium tabular-nums",
                offTarget ? LEVEL_TEXT_CLASSES[metric.level] : "text-muted-foreground",
              )}
            >
              {againstCountLabel(metric.key, facts.against)}
            </span>
          ) : null}
        </div>
        <p className="px-5 text-footnote text-muted-foreground">{groupHint(metric)}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-5 text-footnote">
          {figures.map((figure, index) => (
            <span key={figure.label} className="inline-flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground">{figure.label}</span>
              <span className="font-semibold tabular-nums">{figure.value}</span>
              {figure.delta === null ? null : (
                <DeltaBadge direction={figure.delta.direction} label={figure.delta.label} />
              )}
              {index < figures.length - 1 ? (
                <span aria-hidden="true" className="text-muted-foreground">
                  ·
                </span>
              ) : null}
            </span>
          ))}
        </p>
      </div>
      <OrderRows key={metric.key} supplierId={supplierId} metric={metric} />
    </section>
  );
}
