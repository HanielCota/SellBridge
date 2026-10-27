import type { ComponentProps } from "react";
import { Area, ComposedChart, Line, LineChart } from "recharts";
import type { ChartLayers } from "@/components/reports/chart-kind-menu";
import {
  CHART_MARGIN,
  formatMoney,
  formatMoneyTick,
  LINE_CURSOR,
  renderActiveDot,
  renderFrame,
} from "@/components/reports/chart-frame";
import { TooltipCard, TooltipRow } from "@/components/reports/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceScale, type ChartPoint } from "@/features/reports/chart-view";
import {
  formatAxisDate,
  formatTooltipDate,
  type PointGrain,
} from "@/features/reports/dashboard-metrics";
import type {
  ProductRow,
  SupplierSeries,
} from "@/features/supplier-panel/sales/supplier-chart-data";

const VALUE_COLOR = "var(--chart-brand)";
const chartConfig = { value: { label: "Valor", color: VALUE_COLOR } } satisfies ChartConfig;

const count = new Intl.NumberFormat("pt-BR");

/** "R$ 1.120" or "86 peças", as the tooltip and the headline read the series. */
export function formatSeriesValue(value: number, series: SupplierSeries): string {
  if (series === "units") {
    return `${count.format(value)} ${value === 1 ? "peça" : "peças"}`;
  }
  return formatMoney(value);
}

function tickFormatter(series: SupplierSeries): (value: number) => string {
  return series === "units" ? (value) => count.format(value) : formatMoneyTick;
}

/**
 * The supplier's best sellers, one line each. The theme has a single accent, so the lines differ
 * by weight and dash as well as shade, and the legend draws the same marks.
 */
export const PRODUCT_LINE_STYLES = [
  { color: VALUE_COLOR, opacity: 1, dash: undefined, width: 3 },
  { color: "var(--foreground)", opacity: 0.75, dash: undefined, width: 2 },
  { color: "var(--foreground)", opacity: 0.6, dash: "6 4", width: 2 },
  { color: "var(--foreground)", opacity: 0.5, dash: "2 4", width: 2 },
  { color: "var(--foreground)", opacity: 0.4, dash: "8 3 2 3", width: 2 },
] as const;

/** The chart's box, filling the figure; Recharts sizes the one chart element inside it. */
function PlotBox({ children }: { children: ComponentProps<typeof ChartContainer>["children"] }) {
  return (
    <ChartContainer config={chartConfig} className="absolute inset-0 aspect-auto size-full">
      {children}
    </ChartContainer>
  );
}

interface TooltipInput {
  active?: boolean;
  payload?: { payload?: ChartPoint }[];
  series: SupplierSeries;
  grain: PointGrain;
  layers: ChartLayers;
  cumulative: boolean;
  /** The main row's name: "Peças", "A receber" or, for cancelled orders, "Ficou de fora". */
  valueLabel: string;
}

function TimelineTooltip({
  active,
  payload,
  series,
  grain,
  layers,
  cumulative,
  valueLabel,
}: TooltipInput) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  const date = formatTooltipDate(point.date, grain);
  const previous = layers.average ? point.previousAverageRevenue : point.previousRevenue;
  return (
    <TooltipCard title={cumulative ? `Acumulado até ${date}` : date}>
      <TooltipRow
        color={VALUE_COLOR}
        label={valueLabel}
        value={formatSeriesValue(point.revenue, series)}
        strong
      />
      {layers.average && point.averageRevenue !== null ? (
        <TooltipRow
          color={VALUE_COLOR}
          label="Média de 7 dias"
          value={formatSeriesValue(point.averageRevenue, series)}
        />
      ) : null}
      {layers.compare && previous !== null ? (
        <TooltipRow
          color={VALUE_COLOR}
          variant="dashed"
          label="Período anterior"
          value={formatSeriesValue(previous, series)}
        />
      ) : null}
    </TooltipCard>
  );
}

/** Every value the timeline draws, so the axis frames them all. */
function timelineValues(points: readonly ChartPoint[], layers: ChartLayers): number[] {
  return points.flatMap((point) => {
    const values = [point.revenue, layers.compare ? point.previousRevenue : null];
    return values.filter((value) => value !== null);
  });
}

const VALUE_GRADIENT = (
  <defs>
    <linearGradient id="supplierValue" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={VALUE_COLOR} stopOpacity={0.35} />
      <stop offset="100%" stopColor={VALUE_COLOR} stopOpacity={0.02} />
    </linearGradient>
  </defs>
);

/** The previous period, dashed and quiet behind the current one. */
function renderPreviousLine(smooth: boolean) {
  return (
    <Line
      dataKey={smooth ? "previousAverageRevenue" : "previousRevenue"}
      type="monotone"
      stroke={VALUE_COLOR}
      strokeOpacity={0.6}
      strokeWidth={1.5}
      strokeDasharray="5 5"
      dot={false}
      activeDot={false}
      isAnimationActive={false}
    />
  );
}

/** The value of each bucket: full weight, or a quiet outline under the 7-day average. */
function renderValueArea(smooth: boolean) {
  return (
    <Area
      dataKey="revenue"
      type="monotone"
      stroke={VALUE_COLOR}
      strokeOpacity={smooth ? 0.4 : 1}
      strokeWidth={smooth ? 1.5 : 3}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={smooth ? "none" : "url(#supplierValue)"}
      activeDot={smooth ? false : renderActiveDot(VALUE_COLOR, 6)}
      isAnimationActive={false}
    />
  );
}

/** The 7-day average, the line that carries the trend once the daily values step back. */
function renderAverageLine() {
  return (
    <Line
      dataKey="averageRevenue"
      type="monotone"
      stroke={VALUE_COLOR}
      strokeWidth={3}
      strokeLinecap="round"
      dot={false}
      activeDot={renderActiveDot(VALUE_COLOR, 6)}
      isAnimationActive={false}
    />
  );
}

/**
 * The series over the period, as the reseller's "Evolução" and "Acumulado": an area, the 7-day
 * average taking over when it is on, and the previous period dashed behind.
 */
export function TimelinePlot({
  points,
  series,
  grain,
  layers,
  cumulative,
  valueLabel,
}: Omit<TooltipInput, "active" | "payload"> & { points: ChartPoint[] }) {
  const scale = niceScale(timelineValues(points, layers));
  const smooth = layers.average;
  return (
    <PlotBox>
      <ComposedChart data={points} margin={CHART_MARGIN}>
        {VALUE_GRADIENT}
        {renderFrame({
          scale,
          formatY: tickFormatter(series),
          formatX: (value) => formatAxisDate(value, grain),
          keepStart: grain === "hour",
        })}
        <ChartTooltip
          cursor={LINE_CURSOR}
          content={<TimelineTooltip {...{ series, grain, layers, cumulative, valueLabel }} />}
        />
        {layers.compare ? renderPreviousLine(smooth) : null}
        {renderValueArea(smooth)}
        {smooth ? renderAverageLine() : null}
      </ComposedChart>
    </PlotBox>
  );
}

interface ProductLine {
  productId: string;
  title: string;
}

function ProductTooltip({
  active,
  payload,
  products,
  series,
  grain,
}: {
  active?: boolean;
  payload?: { payload?: ProductRow }[];
  products: readonly ProductLine[];
  series: SupplierSeries;
  grain: PointGrain;
}) {
  const row = payload?.[0]?.payload;
  if (!active || row === undefined) {
    return null;
  }
  return (
    <TooltipCard title={formatTooltipDate(row.date, grain)}>
      {products.map((product, index) => (
        <TooltipRow
          key={product.productId}
          color={PRODUCT_LINE_STYLES[index]?.color ?? VALUE_COLOR}
          variant={index === 0 ? "solid" : "faded"}
          label={product.title}
          value={formatSeriesValue(row.values[product.productId] ?? 0, series)}
        />
      ))}
    </TooltipCard>
  );
}

/** "Por produto": each best seller's line over the period. */
export function ProductPlot({
  rows,
  products,
  series,
  grain,
}: {
  rows: ProductRow[];
  products: readonly ProductLine[];
  series: SupplierSeries;
  grain: PointGrain;
}) {
  const scale = niceScale(rows.flatMap((row) => Object.values(row.values)));
  return (
    <PlotBox>
      <LineChart data={rows} margin={CHART_MARGIN}>
        {renderFrame({
          scale,
          formatY: tickFormatter(series),
          formatX: (value) => formatAxisDate(value, grain),
          keepStart: grain === "hour",
        })}
        <ChartTooltip
          cursor={LINE_CURSOR}
          content={<ProductTooltip {...{ products, series, grain }} />}
        />
        {products.map((product, index) => {
          const style = PRODUCT_LINE_STYLES[index] ?? PRODUCT_LINE_STYLES[1];
          return (
            <Line
              key={product.productId}
              dataKey={(row: ProductRow) => row.values[product.productId] ?? 0}
              name={product.title}
              type="monotone"
              stroke={style.color}
              strokeOpacity={style.opacity}
              strokeWidth={style.width}
              {...(style.dash === undefined ? {} : { strokeDasharray: style.dash })}
              strokeLinecap="round"
              dot={false}
              activeDot={renderActiveDot(style.color, style.width + 3)}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
    </PlotBox>
  );
}
