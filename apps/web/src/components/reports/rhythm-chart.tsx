import { cn } from "cn";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { bestPoint, previousAverage } from "@/features/reports/dashboard-insights";
import {
  formatPointDate,
  METRIC_DEFINITIONS,
  type MetricPoint,
} from "@/features/reports/dashboard-metrics";

const RHYTHM_METRICS = ["profit", "revenue", "orders"] as const;
type RhythmMetric = (typeof RHYTHM_METRICS)[number];

interface RhythmChartProps {
  points: MetricPoint[];
  bucket: "day" | "week";
  /** Previous-period totals, used for the "média anterior" reference line. */
  previousTotals: Record<RhythmMetric, number>;
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload?: { date?: string; value?: number | null } }[];
  metric: RhythmMetric;
  bucket: "day" | "week";
}

function RhythmTooltip({ active, payload, metric, bucket }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point?.date) {
    return null;
  }
  const label = formatPointDate(point.date);
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{bucket === "week" ? `Semana de ${label}` : label}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">
        {point.value === null || point.value === undefined
          ? "—"
          : METRIC_DEFINITIONS[metric].format(point.value)}
      </p>
    </div>
  );
}

function MetricSwitch({
  value,
  onChange,
}: {
  value: RhythmMetric;
  onChange: (metric: RhythmMetric) => void;
}) {
  return (
    <fieldset className="inline-flex rounded-lg bg-muted p-0.5">
      <legend className="sr-only">Indicador do gráfico</legend>
      {RHYTHM_METRICS.map((metric) => (
        <label
          key={metric}
          className="flex h-7 cursor-pointer items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
        >
          <input
            type="radio"
            name="rhythm-metric"
            value={metric}
            checked={metric === value}
            onChange={() => onChange(metric)}
            className="sr-only"
          />
          {METRIC_DEFINITIONS[metric].label}
        </label>
      ))}
    </fieldset>
  );
}

/** Plain render helper (not a component) so recharts receives the ReferenceLine directly. */
function renderAverageLine(average: number | null) {
  if (average === null || average <= 0) {
    return null;
  }
  return (
    <ReferenceLine
      y={average}
      stroke="var(--muted-foreground)"
      strokeOpacity={0.6}
      label={{
        value: "média anterior",
        position: "insideTopRight",
        fill: "var(--muted-foreground)",
        fontSize: 11,
      }}
    />
  );
}

/** Screen-reader twin of the chart: every plotted value, in a plain table. */
function RhythmTable({ points, metric }: { points: MetricPoint[]; metric: RhythmMetric }) {
  const definition = METRIC_DEFINITIONS[metric];
  return (
    <table className="sr-only">
      <caption>{definition.label} por período</caption>
      <thead>
        <tr>
          <th scope="col">Data</th>
          <th scope="col">{definition.label}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => {
          const value = definition.valueOf(point);
          return (
            <tr key={point.date}>
              <td>{formatPointDate(point.date)}</td>
              <td>{value === null ? "—" : definition.format(value)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RhythmBars({
  points,
  bucket,
  metric,
  average,
}: {
  points: MetricPoint[];
  bucket: "day" | "week";
  metric: RhythmMetric;
  average: number | null;
}) {
  const definition = METRIC_DEFINITIONS[metric];
  const data = points.map((point) => ({ date: point.date, value: definition.valueOf(point) }));
  const best = bestPoint(data, (point) => point.value);
  const config = {
    value: { label: definition.label, color: "var(--chart-brand)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 16, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          minTickGap={32}
          tickFormatter={(value: string) => formatPointDate(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => definition.formatTick(value)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={<RhythmTooltip metric={metric} bucket={bucket} />}
        />
        {renderAverageLine(average)}
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
          {data.map((point) => (
            <Cell
              key={point.date}
              fill="var(--color-value)"
              fillOpacity={best?.date === point.date ? 1 : 0.35}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** Day-by-day rhythm of one metric; the best day stands out, the previous average is the bar to beat. */
export function RhythmChart({ points, bucket, previousTotals }: RhythmChartProps) {
  const [metric, setMetric] = useState<RhythmMetric>("profit");
  const label = METRIC_DEFINITIONS[metric].label;
  const unit = bucket === "week" ? "semana" : "dia";
  return (
    <section aria-labelledby="rhythm-title" className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="rhythm-title" className="text-[15px] font-semibold">
            Ritmo por {unit}
          </h2>
          <p className={cn("text-xs text-muted-foreground")}>
            Destaque no melhor {unit}; a linha é a média do período anterior.
          </p>
        </div>
        <MetricSwitch value={metric} onChange={setMetric} />
      </div>
      <figure aria-label={`Gráfico de ${label.toLowerCase()} por ${unit}`} className="mt-4">
        <RhythmBars
          points={points}
          bucket={bucket}
          metric={metric}
          average={previousAverage(previousTotals[metric], points.length)}
        />
        <RhythmTable points={points} metric={metric} />
      </figure>
    </section>
  );
}
