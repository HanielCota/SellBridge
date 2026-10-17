import {
  HEALTH_LEVEL_LABELS,
  HEALTH_METRIC_LABELS,
  HEALTH_WINDOW_DAYS,
  healthForecastText,
  type HealthMetric,
  type HealthMetricKey,
} from "@sellbridge/shared/supplier-panel-health";
import { CaretRightIcon } from "@phosphor-icons/react";
import { ToneStatus } from "@/components/data/tone-status";
import { DeltaBadge } from "@/components/reports/figures";
import { cn } from "@/lib/utils";
import {
  formatHealthTarget,
  formatHealthValue,
  HEALTH_LEVEL_TONES,
  healthDelta,
  sampleNote,
} from "./health-format";

function MetricTrend({ metric }: { metric: HealthMetric }) {
  if (metric.level === "insufficient") {
    return <span className="text-xs text-muted-foreground">{sampleNote(metric)}</span>;
  }
  const delta = healthDelta(metric);
  if (delta === null) {
    return <span className="text-xs text-muted-foreground">Sem período anterior</span>;
  }
  return (
    <DeltaBadge
      direction={delta.direction}
      label={delta.label}
      suffix={`vs. ${HEALTH_WINDOW_DAYS} dias antes`}
    />
  );
}

function MetricRow({
  metric,
  selected,
  onSelect,
}: {
  metric: HealthMetric;
  selected: boolean;
  onSelect: () => void;
}) {
  const forecast = healthForecastText(metric.key, metric.forecast);
  const measured = metric.level === "insufficient" ? null : metric.value;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-[background-color,box-shadow] duration-100 outline-none hover:row-lift focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "bg-muted/60",
      )}
    >
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{HEALTH_METRIC_LABELS[metric.key]}</span>
          <ToneStatus
            tone={HEALTH_LEVEL_TONES[metric.level]}
            label={HEALTH_LEVEL_LABELS[metric.level]}
          />
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatHealthValue(metric.definition, measured)}
          </span>
          <span className="text-footnote text-muted-foreground tabular-nums">
            {formatHealthTarget(metric.definition)}
          </span>
          <MetricTrend metric={metric} />
        </span>
        {forecast === null ? null : (
          <span className="block text-xs text-muted-foreground">{forecast}</span>
        )}
      </span>
      <CaretRightIcon
        className={cn(
          "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
          selected && "rotate-90",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

interface HealthMetricListProps {
  metrics: readonly HealthMetric[];
  selected: HealthMetricKey;
  onSelect: (metric: HealthMetricKey) => void;
}

/** Each metric with its target beside the value, the trend and what the next orders do. */
export function HealthMetricList({ metrics, selected, onSelect }: HealthMetricListProps) {
  return (
    <section aria-label="Métricas" className="surface-card rounded-3xl bg-card p-3 sm:p-4">
      <ul className="space-y-1">
        {metrics.map((metric) => (
          <li key={metric.key}>
            <MetricRow
              metric={metric}
              selected={metric.key === selected}
              onSelect={() => onSelect(metric.key)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
