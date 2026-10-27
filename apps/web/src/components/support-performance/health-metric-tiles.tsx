import type {
  HealthLevel,
  HealthMetricKey,
  SupportHealthMetric,
} from "@sellbridge/shared/support-performance";
import {
  formatHealthValue,
  healthBar,
  HEALTH_METRIC_HINTS,
  HEALTH_METRIC_LABELS,
  healthStatusWords,
  healthTargetShort,
} from "@/features/support/performance-health";
import { cn } from "@/lib/utils";

/*
 * The four targets as cards read at a glance: the number, a bar with the target marked on it and
 * where it stands in plain words. A click opens the tickets behind it in the detail below.
 */

const DOT: Record<HealthLevel, string> = {
  off_target: "bg-destructive",
  warning: "bg-amber-500",
  on_target: "bg-chart-brand",
  insufficient: "bg-muted-foreground/40",
};

const STATUS_TEXT: Record<HealthLevel, string> = {
  off_target: "text-destructive",
  warning: "text-amber-700 dark:text-amber-300",
  on_target: "text-brand-text",
  insufficient: "text-muted-foreground",
};

function TargetBar({ metric }: { metric: SupportHealthMetric }) {
  const { fill, mark } = healthBar(metric);
  return (
    <span aria-hidden="true" className="relative block h-2 rounded-full bg-muted">
      <span
        className={cn("absolute inset-y-0 left-0 rounded-full", DOT[metric.level])}
        style={{ width: `${Math.round(fill * 100)}%` }}
      />
      <span
        className="absolute -inset-y-1 -ml-px w-0.5 rounded-full bg-foreground"
        style={{ left: `${Math.round(mark * 100)}%` }}
      />
    </span>
  );
}

function MetricTile({
  metric,
  selected,
  onSelect,
}: {
  metric: SupportHealthMetric;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      title={HEALTH_METRIC_HINTS[metric.key]}
      className={cn(
        "flex min-h-40 flex-col gap-3 rounded-3xl bg-card p-5 text-left outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "ring-2 ring-foreground" : "surface-interactive",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{HEALTH_METRIC_LABELS[metric.key]}</span>
        <span aria-hidden="true" className={cn("size-2.5 rounded-full", DOT[metric.level])} />
      </span>
      <span className="text-4xl font-semibold tracking-tight tabular-nums">
        {formatHealthValue(metric.key, metric.current)}
      </span>
      <TargetBar metric={metric} />
      <span className="flex justify-between gap-2 text-xs">
        <span className={cn("font-medium", STATUS_TEXT[metric.level])}>
          {healthStatusWords(metric)}
        </span>
        <span className="text-muted-foreground tabular-nums">{healthTargetShort(metric)}</span>
      </span>
    </button>
  );
}

export function HealthMetricTiles({
  metrics,
  selected,
  onSelect,
}: {
  metrics: readonly SupportHealthMetric[];
  selected: HealthMetricKey;
  onSelect: (metric: HealthMetricKey) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Metas do suporte</legend>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricTile
            key={metric.key}
            metric={metric}
            selected={metric.key === selected}
            onSelect={() => onSelect(metric.key)}
          />
        ))}
      </div>
    </fieldset>
  );
}
