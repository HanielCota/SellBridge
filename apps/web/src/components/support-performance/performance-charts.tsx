import type {
  SupportBucket,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { TooltipCard, TooltipRow, type TooltipProps } from "@/components/reports/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceScale } from "@/features/reports/chart-view";
import { bucketLabel, bucketTitle } from "@/features/support/performance-format";

/*
 * The charts of the support performance screen, drawn like the sales dashboard's: a hairline
 * grid, round ticks with headroom (`niceScale`), the brand green for the main series and the
 * muted grey for the one it is compared with.
 */

export const MAIN = "var(--chart-brand)";
export const SECONDARY = "var(--muted-foreground)";
export const CHART_MARGIN = { left: 0, right: 8, top: 16, bottom: 4 };
const count = new Intl.NumberFormat("pt-BR");

interface Axes {
  scale: { domain: [number, number]; ticks: number[] };
  formatY: (value: number) => string;
  bucket: SupportBucket;
  allowDecimals?: boolean;
}

/** Grid and axes shared by every chart, so switching views never moves the frame. */
export function renderAxes({ scale, formatY, bucket, allowDecimals = false }: Axes) {
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
      allowDecimals={allowDecimals}
      padding={{ top: 0, bottom: 4 }}
      tickFormatter={formatY}
    />,
  ];
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
}: TooltipProps<PersonPoint> & { bucket: SupportBucket; name: string }) {
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
