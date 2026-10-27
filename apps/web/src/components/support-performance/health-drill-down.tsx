import type {
  HealthDrillItem,
  HealthLevel,
  SupportHealthMetric,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { Link } from "@tanstack/react-router";
import { StarIcon } from "@phosphor-icons/react";
import { SmartDate } from "@/components/data/smart-date";
import { ACTION_ICONS } from "@/components/icons/action-icons";
import { bucketLabel, bucketTitle, subjectFullLabel } from "@/features/support/performance-format";
import {
  bucketMetTarget,
  DRILL_DOWN_CAPTIONS,
  DRILL_DOWN_EMPTY,
  drillDetailText,
  formatHealthValue,
  HEALTH_METRIC_LABELS,
  healthForecast,
  healthSeriesValue,
  healthTargetShort,
} from "@/features/support/performance-health";
import { cn } from "@/lib/utils";

/*
 * The tickets behind the chosen target: on the left the target bucket by bucket as plain bars
 * with their value written in, on the right the latest tickets that count against it. One
 * accent per card: the target's level colours the sentence and the values.
 */

const SeeAllIcon = ACTION_ICONS.seeAll.icon;
const count = new Intl.NumberFormat("pt-BR");
const BARS_SHOWN = 10;
// Ten bars with their value inside do not fit a phone; it shows the latest ones.
const BARS_ON_PHONE = 5;

const LEVEL_TEXT: Record<HealthLevel, string> = {
  off_target: "text-destructive",
  warning: "text-amber-700 dark:text-amber-300",
  on_target: "text-brand-text",
  insufficient: "text-muted-foreground",
};

const MISS_BAR: Record<HealthLevel, string> = {
  off_target: "bg-destructive",
  warning: "bg-amber-500",
  on_target: "bg-amber-500",
  insufficient: "bg-muted-foreground/40",
};

function ceilingOf(metric: SupportHealthMetric, values: readonly number[]): number {
  if (metric.key === "rating") {
    return 5;
  }
  if (metric.key === "overdue_now") {
    return Math.max(metric.target * 2, ...values.map((value) => value * 1.25), 1);
  }
  return 1;
}

// Bars stop short of the top so the tallest one never touches the card's edge.
const BAR_ROOM = 0.86;

function WeeklyBar({
  metric,
  point,
  ceiling,
  title,
  phoneHidden,
}: {
  metric: SupportHealthMetric;
  point: { start: string; value: number | null };
  ceiling: number;
  title: string;
  phoneHidden: boolean;
}) {
  const met = point.value !== null && bucketMetTarget(metric.key, point.value, metric.target);
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-1 flex-col items-center justify-end",
        phoneHidden && "max-sm:hidden",
      )}
    >
      <span
        title={`${title}: ${formatHealthValue(metric.key, point.value)}`}
        className={cn(
          // relative: paints the bar over the dashed target line, which would cross its value.
          "relative flex min-h-6.5 w-full max-w-14 justify-center rounded-t-lg rounded-b-sm pt-1.5 text-xs font-bold text-card tabular-nums",
          point.value === null && "bg-muted text-muted-foreground",
          point.value !== null && (met ? "bg-chart-brand" : MISS_BAR[metric.level]),
        )}
        style={{ height: `${(((point.value ?? 0) / ceiling) * BAR_ROOM * 100).toFixed(1)}%` }}
      >
        {formatHealthValue(metric.key, point.value)}
      </span>
    </div>
  );
}

function WeeklyBars({
  metric,
  report,
}: {
  metric: SupportHealthMetric;
  report: SupportPerformanceReport;
}) {
  const points = report.series.slice(-BARS_SHOWN).map((point) => ({
    start: point.start,
    value: healthSeriesValue(point, metric.key),
  }));
  const ceiling = ceilingOf(
    metric,
    points.flatMap((point) => (point.value === null ? [] : [point.value])),
  );
  const markPercent = (metric.target / ceiling) * BAR_ROOM * 100;
  return (
    <figure
      aria-label={`${HEALTH_METRIC_LABELS[metric.key]} por período, com a meta`}
      className="min-w-0 space-y-2"
    >
      <div className="relative flex h-44 items-end gap-2 pr-16 shadow-[inset_0_-1px_0_var(--border)]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 right-16 border-t-2 border-dashed border-foreground/40"
          style={{ bottom: `${markPercent}%` }}
        />
        <span
          className="absolute right-0 w-15 text-xs leading-4 font-semibold text-muted-foreground"
          style={{ bottom: `calc(${markPercent}% - 8px)` }}
        >
          {healthTargetShort(metric).replace(/^./, (letter) => letter.toUpperCase())}
        </span>
        {points.map((point, index) => (
          <WeeklyBar
            key={point.start}
            metric={metric}
            point={point}
            ceiling={ceiling}
            title={bucketTitle(point.start, report.bucket)}
            phoneHidden={index < points.length - BARS_ON_PHONE}
          />
        ))}
      </div>
      <div className="flex gap-2 pr-16">
        {points.map((point, index) => (
          <span
            key={point.start}
            className={cn(
              "min-w-0 flex-1 text-center text-xs text-muted-foreground tabular-nums",
              index < points.length - BARS_ON_PHONE && "max-sm:hidden",
            )}
          >
            {bucketLabel(point.start, report.bucket)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function StarRows({ report }: { report: SupportPerformanceReport }) {
  const counts = report.health.ratingCounts;
  const total = counts.reduce((sum, amount) => sum + amount, 0);
  const rows = counts.map((amount, index) => ({ stars: index + 1, amount })).toReversed();
  return (
    <div className="space-y-3">
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatHealthValue("rating", report.overview.rating.value)}
        </span>
        <StarIcon weight="fill" className="size-5 self-center text-amber-500" aria-hidden="true" />
        <span className="text-sm text-muted-foreground tabular-nums">
          / 5 · {count.format(total)} {total === 1 ? "avaliação" : "avaliações"}
        </span>
      </p>
      <ul className="space-y-1.5" aria-label="Notas por estrelas">
        {rows.map((row) => (
          <li
            key={row.stars}
            className="flex items-center gap-2.5 text-xs text-muted-foreground tabular-nums"
          >
            <span className="flex w-7 items-center gap-0.5">
              {row.stars}
              <StarIcon weight="fill" className="size-3 text-amber-500" aria-hidden="true" />
            </span>
            <span className="h-1.5 flex-1 rounded-full bg-muted" aria-hidden="true">
              <span
                className={cn(
                  "block h-full rounded-full",
                  row.stars <= 3 ? "bg-amber-500" : "bg-chart-brand",
                )}
                style={{ width: total === 0 ? 0 : `${Math.round((row.amount / total) * 100)}%` }}
              />
            </span>
            <span className="w-8 text-right">{count.format(row.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DrillRow({
  item,
  names,
  valueClass,
}: {
  item: HealthDrillItem;
  names: ReadonlyMap<string, string>;
  valueClass: string;
}) {
  const agent = item.agentId === null ? undefined : names.get(item.agentId);
  return (
    <li>
      <Link
        to="/admin/chamados/$ticketId"
        params={{ ticketId: item.ticketId }}
        className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-2.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{subjectFullLabel(item)}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {agent === undefined ? null : `${agent} · `}
            <SmartDate date={new Date(item.at)} />
          </span>
        </span>
        <span className={cn("shrink-0 text-footnote font-semibold tabular-nums", valueClass)}>
          {drillDetailText(item.detail)}
        </span>
      </Link>
    </li>
  );
}

function DrillTickets({
  metric,
  report,
}: {
  metric: SupportHealthMetric;
  report: SupportPerformanceReport;
}) {
  const names = new Map(report.team.map((agent) => [agent.id, agent.name]));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h3 className="mb-1 text-footnote font-medium text-muted-foreground">
        {DRILL_DOWN_CAPTIONS[metric.key]}
      </h3>
      {metric.drillDown.length === 0 ? (
        <p className="rounded-2xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          {DRILL_DOWN_EMPTY[metric.key]}
        </p>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {metric.drillDown.map((item) => (
            <DrillRow
              key={`${item.ticketId}-${item.at}`}
              item={item}
              names={names}
              valueClass={LEVEL_TEXT[metric.level]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Only the late queue has a filter of its own; the others say how many more there are. */
function QueueLink({ metric }: { metric: SupportHealthMetric }) {
  if (metric.key === "overdue_now" && metric.drillDownTotal > 0) {
    return (
      <Link
        to="/admin/chamados"
        search={{ queue: "overdue" }}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-medium transition-colors outline-none hover:bg-foreground hover:text-background focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Ver os {count.format(metric.drillDownTotal)} na fila
        <SeeAllIcon className="size-3.5" weight="bold" aria-hidden="true" />
      </Link>
    );
  }
  const hidden = metric.drillDownTotal - metric.drillDown.length;
  if (hidden <= 0) {
    return null;
  }
  return (
    <span className="text-xs text-muted-foreground">Mais {count.format(hidden)} no período</span>
  );
}

export function HealthDrillDown({
  metric,
  report,
}: {
  metric: SupportHealthMetric;
  report: SupportPerformanceReport;
}) {
  return (
    <section
      aria-labelledby="health-drill-down-title"
      className="surface-card flex min-w-0 flex-col gap-6 rounded-3xl bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 id="health-drill-down-title" className="text-subhead font-semibold">
            {HEALTH_METRIC_LABELS[metric.key]}
          </h2>
          <p className={cn("mt-1 text-sm font-medium", LEVEL_TEXT[metric.level])}>
            {healthForecast(metric)}
          </p>
        </div>
        <QueueLink metric={metric} />
      </div>
      <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-2">
        {metric.key === "rating" ? (
          <StarRows report={report} />
        ) : (
          <WeeklyBars metric={metric} report={report} />
        )}
        <DrillTickets metric={metric} report={report} />
      </div>
    </section>
  );
}
