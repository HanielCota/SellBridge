import type {
  SupportBucket,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, ReferenceLine } from "recharts";
import type { ReactNode } from "react";
import { TooltipCard, TooltipRow, type TooltipProps } from "@/components/reports/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceScale } from "@/features/reports/chart-view";
import { bucketTitle } from "@/features/support/performance-format";
import {
  bucketComparison,
  kindPoints,
  type KindPoint,
  type SupportChartKind,
} from "@/features/support/support-chart-kinds";
import { formatPercent } from "@/lib/percent";
import { cn } from "@/lib/utils";
import { CHART_MARGIN, MAIN, renderAxes, SECONDARY } from "./performance-charts";

/*
 * The main support chart in its five kinds. Every kind shares the axes, the hover card and the
 * colours: green for resolved, grey for what came in, red when the queue grew.
 */

export type VolumeSeries = "both" | "resolved" | "opened";

const DANGER = "var(--destructive)";
const TOP_RADIUS: [number, number, number, number] = [6, 6, 2, 2];
const count = new Intl.NumberFormat("pt-BR");

const config = {
  opened: { label: "Entraram", color: SECONDARY },
  resolved: { label: "Resolvidos", color: MAIN },
  previousResolved: { label: "Período anterior", color: SECONDARY },
  balance: { label: "Saldo", color: DANGER },
  rate: { label: "Taxa", color: MAIN },
} satisfies ChartConfig;

function balanceSentence(point: KindPoint): { text: string; className: string } {
  if (point.balance > 0) {
    return { text: `A fila cresceu ${point.balance}`, className: "text-destructive" };
  }
  if (point.balance < 0) {
    return { text: `A fila diminuiu ${Math.abs(point.balance)}`, className: "text-brand-text" };
  }
  return { text: "Saiu o mesmo tanto que entrou", className: "text-muted-foreground" };
}

/** The hover card of every kind: what came in, what was solved and how the queue moved. */
function VolumeTooltip({
  active,
  payload,
  bucket,
  points,
}: TooltipProps<KindPoint> & { bucket: SupportBucket; points: readonly KindPoint[] }) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  const index = points.findIndex((item) => item.start === point.start);
  const raw = index === -1 ? point : (points[index] ?? point);
  const balance = balanceSentence(raw);
  const comparison = bucketComparison(points, index, bucket);
  return (
    <TooltipCard
      title={bucketTitle(point.start, bucket)}
      footnote={
        <>
          <span className={cn("block text-sm font-semibold", balance.className)}>
            {balance.text}
          </span>
          {comparison === null ? null : <span className="mt-1 block">{comparison}</span>}
        </>
      }
    >
      <TooltipRow color={SECONDARY} label="Entraram" value={count.format(raw.opened)} />
      <TooltipRow color={MAIN} label="Resolvidos" value={count.format(raw.resolved)} strong />
    </TooltipCard>
  );
}

interface KindProps {
  report: SupportPerformanceReport;
  series: VolumeSeries;
  compare: boolean;
}

function tooltip(
  report: SupportPerformanceReport,
  points: readonly KindPoint[],
  bars: boolean,
): ReactNode {
  return (
    <ChartTooltip
      cursor={
        bars
          ? { fill: "var(--muted)", fillOpacity: 0.5 }
          : { stroke: "var(--foreground)", strokeOpacity: 0.35, strokeDasharray: "4 4" }
      }
      content={<VolumeTooltip bucket={report.bucket} points={kindPoints(report.series, "bars")} />}
    />
  );
}

function BarsKind({ report, series }: KindProps) {
  const points = kindPoints(report.series, "bars");
  const scale = niceScale(points.flatMap((point) => [point.opened, point.resolved]));
  return (
    <BarChart data={points} margin={CHART_MARGIN} barGap={4}>
      {renderAxes({ scale, formatY: (value) => count.format(value), bucket: report.bucket })}
      {tooltip(report, points, true)}
      {series === "resolved" ? null : (
        <Bar
          dataKey="opened"
          fill={SECONDARY}
          fillOpacity={0.45}
          radius={TOP_RADIUS}
          maxBarSize={28}
          isAnimationActive={false}
        />
      )}
      {series === "opened" ? null : (
        <Bar
          dataKey="resolved"
          fill={MAIN}
          radius={TOP_RADIUS}
          maxBarSize={28}
          isAnimationActive={false}
        />
      )}
    </BarChart>
  );
}

function LinesKind({ report, series, compare, cumulative }: KindProps & { cumulative: boolean }) {
  const points = kindPoints(report.series, cumulative ? "cumulative" : "trend");
  const scale = niceScale(
    points.flatMap((point) => [
      point.opened,
      point.resolved,
      ...(compare ? [point.previousResolved] : []),
    ]),
  );
  return (
    <AreaChart data={points} margin={CHART_MARGIN}>
      <defs>
        <linearGradient id="supportResolvedArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={MAIN} stopOpacity={0.28} />
          <stop offset="100%" stopColor={MAIN} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {renderAxes({ scale, formatY: (value) => count.format(value), bucket: report.bucket })}
      {tooltip(report, points, false)}
      {compare && series !== "opened" ? (
        <Area
          dataKey="previousResolved"
          type="monotone"
          stroke={SECONDARY}
          strokeOpacity={0.7}
          strokeWidth={1.5}
          strokeDasharray="5 5"
          fill="none"
          isAnimationActive={false}
        />
      ) : null}
      {series === "resolved" ? null : (
        <Area
          dataKey="opened"
          type="monotone"
          stroke={SECONDARY}
          strokeWidth={2}
          fill="none"
          isAnimationActive={false}
        />
      )}
      {series === "opened" ? null : (
        <Area
          dataKey="resolved"
          type="monotone"
          stroke={MAIN}
          strokeWidth={2.5}
          fill="url(#supportResolvedArea)"
          isAnimationActive={false}
        />
      )}
    </AreaChart>
  );
}

function BalanceKind({ report }: KindProps) {
  const points = kindPoints(report.series, "balance");
  const scale = niceScale(points.map((point) => point.balance));
  return (
    <BarChart data={points} margin={CHART_MARGIN}>
      {renderAxes({ scale, formatY: (value) => count.format(value), bucket: report.bucket })}
      {tooltip(report, points, true)}
      <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.35} />
      <Bar dataKey="balance" radius={4} maxBarSize={32} isAnimationActive={false}>
        {points.map((point) => (
          <Cell key={point.start} fill={point.balance > 0 ? DANGER : MAIN} />
        ))}
      </Bar>
    </BarChart>
  );
}

// 100% is the line where as much leaves as comes in; the headroom keeps 120% weeks inside.
const RATE_SCALE = { domain: [0, 1.32] as [number, number], ticks: [0, 0.6, 1.2] };

function RateKind({ report }: KindProps) {
  const points = kindPoints(report.series, "rate");
  return (
    <LineChart data={points} margin={CHART_MARGIN}>
      {renderAxes({
        scale: RATE_SCALE,
        formatY: (value) => formatPercent(value),
        bucket: report.bucket,
        allowDecimals: true,
      })}
      {tooltip(report, points, false)}
      <ReferenceLine
        y={1}
        stroke="var(--muted-foreground)"
        strokeOpacity={0.7}
        strokeDasharray="5 5"
      />
      <Line
        dataKey="rate"
        stroke={MAIN}
        strokeWidth={2.5}
        dot={false}
        connectNulls
        isAnimationActive={false}
      />
    </LineChart>
  );
}

// Recharts reads the chart straight from the container's only child, so each kind is called
// as a function that returns its chart element instead of being mounted as a component.
const KIND_CHARTS: Record<SupportChartKind, (props: KindProps) => ReactNode> = {
  bars: BarsKind,
  trend: (props) => LinesKind({ ...props, cumulative: false }),
  cumulative: (props) => LinesKind({ ...props, cumulative: true }),
  balance: BalanceKind,
  rate: RateKind,
};

export function VolumeKindChart({ kind, ...props }: KindProps & { kind: SupportChartKind }) {
  return (
    <ChartContainer config={config} className="absolute inset-0 aspect-auto size-full">
      {KIND_CHARTS[kind](props)}
    </ChartContainer>
  );
}
