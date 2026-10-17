import {
  HEALTH_LEVEL_LABELS,
  HEALTH_METRIC_LABELS,
  type HealthMetric,
  type HealthMetricKey,
} from "@sellbridge/shared/supplier-panel-health";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { ToneStatus } from "@/components/data/tone-status";
import { DeltaBadge } from "@/components/reports/figures";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatHealthTarget,
  formatHealthValue,
  HEALTH_LEVEL_TONES,
  healthDelta,
  sampleNote,
} from "./health-format";
import { useInAppLinkClick } from "@/hooks/use-in-app-link";

const VERSUS = "vs. anterior";

/** Under the value: the move against the previous window, or how much sample is missing. */
function TileFooter({ metric }: { metric: HealthMetric }) {
  if (metric.level === "insufficient") {
    return <span className="text-muted-foreground">{sampleNote(metric)}</span>;
  }
  const delta = healthDelta(metric);
  if (delta === null) {
    return <span className="text-muted-foreground">Sem período anterior</span>;
  }
  return <DeltaBadge direction={delta.direction} label={delta.label} suffix={VERSUS} />;
}

/**
 * One metric as a stat tile, like the reseller's KPI tiles: the name and level on top, the
 * value with its target right beside it, the change underneath. A short sample shows a dash
 * and the count still missing, never a red number from three orders.
 */
function HealthTile({ metric, href }: { metric: HealthMetric; href: string }) {
  const label = HEALTH_METRIC_LABELS[metric.key];
  const measured = metric.level === "insufficient" ? null : metric.value;
  const onClick = useInAppLinkClick();
  return (
    <a
      href={href}
      onClick={onClick}
      aria-label={`Ver ${label.toLowerCase()} no desempenho`}
      className="group surface-interactive flex min-h-36 cursor-pointer select-none min-w-0 flex-col justify-between gap-3 rounded-3xl bg-card p-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <ArrowUpRightIcon
          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          aria-hidden="true"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[30px] leading-none font-semibold tabular-nums">
            {formatHealthValue(metric.definition, measured)}
          </span>
          <span className="text-footnote text-muted-foreground tabular-nums">
            {formatHealthTarget(metric.definition)}
          </span>
        </div>
        <ToneStatus
          tone={HEALTH_LEVEL_TONES[metric.level]}
          label={HEALTH_LEVEL_LABELS[metric.level]}
        />
        <div className="flex min-h-4 flex-wrap items-center gap-x-1.5 text-xs">
          <TileFooter metric={metric} />
        </div>
      </div>
    </a>
  );
}

interface HealthTilesProps {
  metrics: readonly HealthMetric[];
  hrefFor: (metric: HealthMetricKey) => string;
}

/** The four health numbers, two by two beside the queue on wide screens. */
export function HealthTiles({ metrics, hrefFor }: HealthTilesProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {metrics.map((metric) => (
        <HealthTile key={metric.key} metric={metric} href={hrefFor(metric.key)} />
      ))}
    </div>
  );
}

export function HealthTilesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
      {["first", "second", "third", "fourth"].map((slot) => (
        <Skeleton key={slot} className="h-40 rounded-3xl" />
      ))}
    </div>
  );
}
