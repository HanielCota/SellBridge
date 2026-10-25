import type { SeriesPoint, SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import { RESPONSE_TARGET_HOURS } from "@sellbridge/shared/ticket-rules";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { TooltipCard, TooltipRow, type TooltipProps } from "@/components/reports/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceScale } from "@/features/reports/chart-view";
import {
  bucketLabel,
  bucketTitle,
  formatAxisMinutes,
  formatMinutes,
} from "@/features/support/performance-format";

/*
 * The charts of the support performance screen, drawn like the sales dashboard's: a hairline
 * grid, round ticks with headroom (`niceScale`), the brand green for the main series and the
 * muted grey for the one it is compared with.
 */

const MAIN = "var(--chart-brand)";
const SECONDARY = "var(--muted-foreground)";
const CHART_MARGIN = { left: 0, right: 8, top: 16, bottom: 4 };
const TOP_RADIUS: [number, number, number, number] = [6, 6, 2, 2];
const URGENT_TARGET_MINUTES = RESPONSE_TARGET_HOURS.urgent * 60;
const count = new Intl.NumberFormat("pt-BR");

interface Axes {
  scale: { domain: [number, number]; ticks: number[] };
  formatY: (value: number) => string;
  bucket: "day" | "week";
}

/** Grid and axes shared by every chart, so switching views never moves the frame. */
function renderAxes({ scale, formatY, bucket }: Axes) {
  return [
    <CartesianGrid key="grid" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />,
    <XAxis
      key="x"
      dataKey="start"
      tickLine={false}
      axisLine={false}
      tickMargin={12}
      minTickGap={24}
      interval="preserveStartEnd"
      tickFormatter={(value: string) => bucketLabel(value, bucket)}
    />,
    <YAxis
      key="y"
      width="auto"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      domain={scale.domain}
      ticks={scale.ticks}
      allowDecimals={false}
      padding={{ top: 0, bottom: 4 }}
      tickFormatter={formatY}
    />,
  ];
}

const volumeConfig = {
  opened: { label: "Entraram", color: SECONDARY },
  resolved: { label: "Resolvidos", color: MAIN },
} satisfies ChartConfig;

export type VolumeSeries = "both" | "resolved" | "opened";

function VolumeTooltip({
  active,
  payload,
  bucket,
}: TooltipProps<SeriesPoint> & { bucket: "day" | "week" }) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  return (
    <TooltipCard title={bucketTitle(point.start, bucket)}>
      <TooltipRow color={SECONDARY} label="Entraram" value={count.format(point.opened)} />
      <TooltipRow color={MAIN} label="Resolvidos" value={count.format(point.resolved)} strong />
    </TooltipCard>
  );
}

/** Tickets in against tickets resolved: is the team keeping up? */
export function VolumeChart({
  report,
  series,
}: {
  report: SupportPerformanceReport;
  series: VolumeSeries;
}) {
  const values = report.series.flatMap((point) => [point.opened, point.resolved]);
  const scale = niceScale(values);
  return (
    <ChartContainer config={volumeConfig} className="absolute inset-0 aspect-auto size-full">
      <BarChart data={report.series} margin={CHART_MARGIN} barGap={4}>
        {renderAxes({ scale, formatY: (value) => count.format(value), bucket: report.bucket })}
        <ChartTooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
          content={<VolumeTooltip bucket={report.bucket} />}
        />
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
    </ChartContainer>
  );
}

const responseConfig = {
  firstResponseMinutes: { label: "Primeira resposta", color: MAIN },
} satisfies ChartConfig;

function ResponseTooltip({
  active,
  payload,
  bucket,
}: TooltipProps<SeriesPoint> & { bucket: "day" | "week" }) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  return (
    <TooltipCard
      title={bucketTitle(point.start, bucket)}
      footnote="Metade dos chamados recebeu a primeira resposta em até esse tempo."
    >
      <TooltipRow
        color={MAIN}
        label="Primeira resposta"
        value={formatMinutes(point.firstResponseMinutes)}
        strong
      />
    </TooltipCard>
  );
}

/** The median first response over the period, against the urgent priority's target. */
export function ResponseChart({ report }: { report: SupportPerformanceReport }) {
  const values = report.series.flatMap((point) =>
    point.firstResponseMinutes === null ? [] : [point.firstResponseMinutes],
  );
  const scale = niceScale([...values, URGENT_TARGET_MINUTES]);
  return (
    <ChartContainer config={responseConfig} className="absolute inset-0 aspect-auto size-full">
      <AreaChart data={report.series} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="supportResponse" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MAIN} stopOpacity={0.3} />
            <stop offset="100%" stopColor={MAIN} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {renderAxes({ scale, formatY: formatAxisMinutes, bucket: report.bucket })}
        <ReferenceLine
          y={URGENT_TARGET_MINUTES}
          stroke="var(--destructive)"
          strokeOpacity={0.7}
          strokeDasharray="5 5"
        />
        <ChartTooltip
          cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.35, strokeDasharray: "4 4" }}
          content={<ResponseTooltip bucket={report.bucket} />}
        />
        <Area
          dataKey="firstResponseMinutes"
          type="monotone"
          stroke={MAIN}
          strokeWidth={2.5}
          fill="url(#supportResponse)"
          connectNulls
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

interface PersonPoint {
  start: string;
  own: number;
  team: number;
}

const personConfig = {
  own: { label: "Pessoa", color: MAIN },
  team: { label: "Média da equipe", color: SECONDARY },
} satisfies ChartConfig;

function PersonTooltip({
  active,
  payload,
  bucket,
  name,
}: TooltipProps<PersonPoint> & { bucket: "day" | "week"; name: string }) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  const title = bucketTitle(point.start, bucket);
  return (
    <TooltipCard title={title}>
      <TooltipRow color={MAIN} label={name} value={count.format(point.own)} strong />
      <TooltipRow
        color={SECONDARY}
        label="Média da equipe"
        value={count.format(Math.round(point.team * 10) / 10)}
        variant="dashed"
      />
    </TooltipCard>
  );
}

/** A person's resolutions per bucket against the team's average: the learning curve. */
export function PersonChart({
  report,
  resolvedSeries,
  name,
}: {
  report: SupportPerformanceReport;
  resolvedSeries: readonly number[];
  name: string;
}) {
  const data: PersonPoint[] = report.series.map((point, index) => ({
    start: point.start,
    own: resolvedSeries[index] ?? 0,
    team: point.teamResolvedPerAgent,
  }));
  const scale = niceScale(data.flatMap((point) => [point.own, point.team]));
  return (
    <ChartContainer config={personConfig} className="absolute inset-0 aspect-auto size-full">
      <LineChart data={data} margin={CHART_MARGIN}>
        {renderAxes({ scale, formatY: (value) => count.format(value), bucket: report.bucket })}
        <ChartTooltip
          cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.35, strokeDasharray: "4 4" }}
          content={<PersonTooltip bucket={report.bucket} name={name} />}
        />
        <Line
          dataKey="team"
          stroke={SECONDARY}
          strokeOpacity={0.6}
          strokeWidth={1.5}
          strokeDasharray="5 5"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="own"
          stroke={MAIN}
          strokeWidth={2.5}
          strokeLinecap="round"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
