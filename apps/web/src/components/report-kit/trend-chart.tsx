import { monthLabel } from "@sellbridge/shared/report-period";
import { lineAxis, positionOf, type ChartAxis } from "@/features/report-kit/chart-scale";
import {
  formatCompactValue,
  formatReportValue,
  targetLabel,
  targetStatus,
} from "@/features/report-kit/report-format";
import type {
  ReportTarget,
  ReportTrendPoint,
  ReportValueFormat,
} from "@/features/report-kit/report-model";
import { cn } from "@/lib/utils";

const shortMonth = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

function monthTick(month: string): string {
  return shortMonth.format(new Date(`${month}-15T12:00:00.000Z`)).replace(".", "");
}

interface TrendChartProps {
  points: readonly ReportTrendPoint[];
  format: ReportValueFormat;
  target: ReportTarget | null;
  showValues: boolean;
}

interface PlacedPoint extends ReportTrendPoint {
  /** 0–100 from the left. */
  left: number;
  /** 0–100 from the top; null for a month without data. */
  top: number | null;
}

function describe(
  points: readonly ReportTrendPoint[],
  format: ReportValueFormat,
  target: ReportTarget | null,
) {
  const values = points
    .map(
      (point) =>
        `${monthLabel(point.month)}: ${point.value === null ? "sem dados" : formatReportValue(point.value, format)}`,
    )
    .join("; ");
  return target === null ? values : `${values}. Meta ${targetLabel(target, format)}`;
}

function placePoints(points: readonly ReportTrendPoint[], axis: ChartAxis): PlacedPoint[] {
  const step = points.length > 1 ? 100 / (points.length - 1) : 0;
  return points.map((point, index) => ({
    ...point,
    left: index * step,
    top: point.value === null ? null : 100 - positionOf(point.value, axis),
  }));
}

function AxisLines({ axis, format }: { axis: ChartAxis; format: ReportValueFormat }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {axis.ticks.map((tick) => (
        <div
          key={tick}
          className="absolute inset-x-0 flex items-center gap-2"
          style={{ bottom: `${positionOf(tick, axis)}%` }}
        >
          <span className="w-16 -translate-y-1/2 whitespace-nowrap text-right text-[11px] text-muted-foreground tabular-nums">
            {formatCompactValue(tick, format)}
          </span>
          <span className="h-px flex-1 -translate-y-1/2 bg-border" />
        </div>
      ))}
    </div>
  );
}

function Lines({
  placed,
  target,
  axis,
}: {
  placed: readonly PlacedPoint[];
  target: ReportTarget | null;
  axis: ChartAxis;
}) {
  const path = placed
    .flatMap((point) => (point.top === null ? [] : [`${point.left},${point.top}`]))
    .join(" ");
  const targetTop = target === null ? null : 100 - positionOf(target.value, axis);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 size-full overflow-visible"
      aria-hidden="true"
    >
      {targetTop === null ? null : (
        <line
          x1="0"
          x2="100"
          y1={targetTop}
          y2={targetTop}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={path}
        fill="none"
        stroke="var(--chart-brand)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The first and last labels open inward, so they never cross the axis or the card edge. */
function labelAlignment(left: number): string {
  if (left === 0) {
    return "left-0";
  }
  if (left === 100) {
    return "right-0";
  }
  return "left-1/2 -translate-x-1/2";
}

/** A filled dot, or a hollow one when the month missed the target (readable without color). */
function Dot({
  point,
  target,
  format,
  showValue,
}: {
  point: PlacedPoint;
  target: ReportTarget | null;
  format: ReportValueFormat;
  showValue: boolean;
}) {
  if (point.top === null || point.value === null) {
    return null;
  }
  const below = targetStatus(point.value, target)?.met === false;
  return (
    <span
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${point.left}%`, top: `${point.top}%` }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "block size-2.5 rounded-full border-2 border-chart-brand",
          below ? "bg-card" : "bg-chart-brand",
        )}
      />
      {showValue ? (
        <span
          className={cn(
            "absolute bottom-full pb-1 text-[11px] font-medium whitespace-nowrap tabular-nums",
            labelAlignment(point.left),
          )}
        >
          {formatCompactValue(point.value, format)}
        </span>
      ) : null}
    </span>
  );
}

function TargetLegend({ target, format }: { target: ReportTarget; format: ReportValueFormat }) {
  return (
    <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 border-t-2 border-dashed border-muted-foreground" aria-hidden="true" />
        Meta {targetLabel(target, format)}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full border-2 border-chart-brand bg-card"
          aria-hidden="true"
        />
        Mês fora da meta
      </span>
    </p>
  );
}

/**
 * The main indicator over the last six months, with the target as a dashed line. A month below
 * the target gets a hollow dot. A line may have a cut axis (bars never do).
 */
export function TrendChart({ points, format, target, showValues }: TrendChartProps) {
  const known = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const axis = lineAxis(known, target?.value ?? null, format === "rate" ? 1 : null);
  const placed = placePoints(points, axis);
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart is drawn with HTML and SVG, which an <img> cannot hold; the label carries every number
    <figure role="img" aria-label={describe(points, format, target)}>
      <div className="relative h-44 pt-5">
        <div className="relative h-full">
          <AxisLines axis={axis} format={format} />
          <div className="absolute inset-y-0 right-3 left-21">
            <Lines placed={placed} target={target} axis={axis} />
            {placed.map((point) => (
              <Dot
                key={point.month}
                point={point}
                target={target}
                format={format}
                showValue={showValues}
              />
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="relative mr-3 ml-21 h-5 pt-2">
        {placed.map((point) => (
          <span
            key={point.month}
            className="absolute -translate-x-1/2 text-xs text-muted-foreground"
            style={{ left: `${point.left}%` }}
          >
            {monthTick(point.month)}
          </span>
        ))}
      </div>
      {target ? <TargetLegend target={target} format={format} /> : null}
    </figure>
  );
}
