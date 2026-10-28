import {
  HEALTH_LEVEL_LABELS,
  HEALTH_METRIC_LABELS,
  type HealthMetric,
  type HealthMetricKey,
} from "@sellbridge/shared/supplier-panel-health";
import { TONE_DOT_CLASSES } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";
import {
  formatHealthTarget,
  formatHealthValue,
  HEALTH_LEVEL_TONES,
  metricHint,
  sampleNote,
} from "../home/health-format";

/**
 * One cell per metric. The number stays neutral and only the small dot carries the level, so
 * the strip reads calm; the selected cell opens its orders right below.
 */
function MetricCell({
  metric,
  selected,
  onSelect,
}: {
  metric: HealthMetric;
  selected: boolean;
  onSelect: () => void;
}) {
  const insufficient = metric.level === "insufficient";
  return (
    <button
      type="button"
      title={metricHint(metric)}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        // The fifth cell fills the last row on two and three columns, so no gray hole is left.
        "flex min-w-0 cursor-pointer flex-col gap-0.5 px-5 py-4 text-left outline-none transition-colors duration-100 select-none last:col-span-2 lg:last:col-span-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
        selected
          ? "bg-[color-mix(in_oklch,var(--foreground)_5%,var(--card))] shadow-[inset_0_-2px_0_var(--foreground)]"
          : "bg-card hover:bg-[color-mix(in_oklch,var(--foreground)_4%,var(--card))]",
      )}
    >
      <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            TONE_DOT_CLASSES[HEALTH_LEVEL_TONES[metric.level]],
          )}
        />
        {HEALTH_METRIC_LABELS[metric.key]}
      </span>
      <span
        className={cn(
          "mt-0.5 text-2xl font-semibold tracking-tight tabular-nums",
          insufficient && "text-muted-foreground",
        )}
      >
        {insufficient ? "—" : formatHealthValue(metric.definition, metric.value)}
      </span>
      <span className="text-footnote text-muted-foreground tabular-nums">
        {insufficient ? sampleNote(metric) : formatHealthTarget(metric.definition)}
      </span>
      <span className="sr-only">Nível: {HEALTH_LEVEL_LABELS[metric.level]}</span>
    </button>
  );
}

export function PerformanceMetricStrip({
  metrics,
  selected,
  onSelect,
}: {
  metrics: readonly HealthMetric[];
  selected: HealthMetricKey;
  onSelect: (metric: HealthMetricKey) => void;
}) {
  return (
    <section
      aria-label="Métricas"
      className="grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-3 lg:grid-cols-5"
    >
      {metrics.map((metric) => (
        <MetricCell
          key={metric.key}
          metric={metric}
          selected={metric.key === selected}
          onSelect={() => onSelect(metric.key)}
        />
      ))}
    </section>
  );
}
