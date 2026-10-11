import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { type ComponentProps, type ReactNode, useCallback, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartKindMenu, type ChartLayers } from "@/components/reports/chart-kind-menu";
import { DeltaBadge, MoneyFigure, TrendBadge } from "@/components/reports/figures";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  buildChartPoints,
  buildWaterfall,
  type ChartKind,
  type ChartPoint,
  type FlowSummary,
  groupByWeek,
  hasSales,
  niceScale,
  periodMargin,
  useDefaultChartKind,
  type WaterfallStep,
  type WaterfallTone,
} from "@/features/reports/chart-view";
import {
  formatAxisDate,
  formatTooltipDate,
  type MetricPoint,
  type PointGrain,
} from "@/features/reports/dashboard-metrics";
import { cn } from "@/lib/utils";

/** Mint is reserved for profit (the hero metric); revenue is neutral context behind it. */
const REVENUE_COLOR = "var(--muted-foreground)";
const PROFIT_COLOR = "var(--chart-brand)";

const SERIES = [
  { key: "all", label: "Tudo", color: null },
  { key: "revenue", label: "Receita", color: REVENUE_COLOR },
  { key: "profit", label: "Lucro", color: PROFIT_COLOR },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const chartConfig = {
  revenue: { label: "Receita", color: REVENUE_COLOR },
  profit: { label: "Lucro", color: PROFIT_COLOR },
} satisfies ChartConfig;

/** The pills double as the legend: each series carries the dot of the color it is drawn in. */
function SeriesPills({
  value,
  onChange,
}: {
  value: SeriesKey;
  onChange: (next: SeriesKey) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-1 sm:gap-1.5">
      <legend className="sr-only">Séries do gráfico</legend>
      {SERIES.map((series) => (
        <label
          key={series.key}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:font-medium has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40 sm:px-4"
        >
          <input
            type="radio"
            name="cash-series"
            value={series.key}
            checked={series.key === value}
            onChange={() => onChange(series.key)}
            className="sr-only"
          />
          {series.color ? (
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: series.color }}
            />
          ) : null}
          {series.label}
        </label>
      ))}
    </fieldset>
  );
}

/** Axis labels stay short: "R$ 1,2 mil". */
const axisMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const tooltipMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function formatMoney(cents: number): string {
  return tooltipMoney.format(Math.round(cents / 100));
}

const formatMoneyTick = (cents: number) => axisMoney.format(cents / 100);
const formatPercentTick = (value: number) => `${percent.format(value)}%`;

// ── Tooltips ────────────────────────────────────────────────────────────────

interface TooltipProps<Payload> {
  active?: boolean;
  payload?: { payload?: Payload }[];
}

type SwatchVariant = "solid" | "faded" | "dashed";

/** Same color as the mark it describes, so the card reads like a legend; dashed for the past. */
function Swatch({ color, variant = "solid" }: { color: string; variant?: SwatchVariant }) {
  if (variant === "dashed") {
    return (
      <span
        aria-hidden="true"
        className="h-0 w-2.5 border-t-2 border-dashed"
        style={{ borderColor: color }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 rounded-full", variant === "faded" && "opacity-40")}
      style={{ backgroundColor: color }}
    />
  );
}

function TooltipRow({
  color,
  label,
  value,
  variant = "solid",
  strong = false,
}: {
  color: string;
  label: string;
  value: string;
  variant?: SwatchVariant;
  strong?: boolean;
}) {
  return (
    <>
      <Swatch color={color} variant={variant} />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right tabular-nums", strong ? "font-semibold" : "font-medium")}>
        {value}
      </dd>
    </>
  );
}

function TooltipCard({
  title,
  children,
  footnote,
}: {
  title: string;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <div className="min-w-52 rounded-xl border border-border bg-popover px-3.5 py-3 text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">{title}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-sm">
        {children}
      </dl>
      {footnote ? (
        <p className="mt-2.5 border-t border-border pt-2 text-xs text-muted-foreground">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

function MarginFootnote({ margin }: { margin: number | null }) {
  if (margin === null) {
    return null;
  }
  return (
    <>
      Margem de <span className="font-medium text-foreground">{percent.format(margin)}%</span>
    </>
  );
}

/** The comparison line's value: the previous profit, or the previous revenue when only it shows. */
function PreviousRow({
  point,
  series,
  layers,
}: {
  point: ChartPoint;
  series: SeriesKey;
  layers: ChartLayers;
}) {
  const isRevenue = series === "revenue";
  const smoothed = isRevenue ? point.previousAverageRevenue : point.previousAverageProfit;
  const daily = isRevenue ? point.previousRevenue : point.previousProfit;
  const value = layers.average ? smoothed : daily;
  const show = layers.compare;
  if (!show || value === null) {
    return null;
  }
  return (
    <TooltipRow
      color={isRevenue ? REVENUE_COLOR : PROFIT_COLOR}
      label={`${isRevenue ? "Receita" : "Lucro"} no período anterior${layers.average ? ", média" : ""}`}
      value={formatMoney(value)}
      variant="dashed"
    />
  );
}

/** Date, the series the chart draws and, when shown, the 7-day average and the previous period. */
function ProfitTooltip({
  active,
  payload,
  series,
  grain,
  cumulative,
  layers,
}: TooltipProps<ChartPoint> & {
  series: SeriesKey;
  grain: PointGrain;
  cumulative: boolean;
  layers: ChartLayers;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  const date = formatTooltipDate(point.date, grain);
  return (
    <TooltipCard
      title={cumulative ? `Acumulado até ${date}` : date}
      footnote={<MarginFootnote margin={point.margin} />}
    >
      <TooltipRow color={REVENUE_COLOR} label="Receita" value={formatMoney(point.revenue)} />
      <TooltipRow color={PROFIT_COLOR} label="Lucro" value={formatMoney(point.profit)} strong />
      {layers.average && point.averageProfit !== null ? (
        <TooltipRow
          color={PROFIT_COLOR}
          label="Lucro, média de 7 dias"
          value={formatMoney(point.averageProfit)}
          variant="faded"
        />
      ) : null}
      <PreviousRow point={point} series={series} layers={layers} />
    </TooltipCard>
  );
}

function CompositionTooltip({
  active,
  payload,
  grain,
}: TooltipProps<ChartPoint> & { grain: PointGrain }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  return (
    <TooltipCard
      title={formatTooltipDate(point.date, grain)}
      footnote={<MarginFootnote margin={point.margin} />}
    >
      <TooltipRow color={REVENUE_COLOR} label="Receita" value={formatMoney(point.revenue)} />
      <TooltipRow
        color={REVENUE_COLOR}
        label="Custos e taxas"
        value={formatMoney(point.cost)}
        variant="faded"
      />
      <TooltipRow color={PROFIT_COLOR} label="Lucro" value={formatMoney(point.profit)} strong />
    </TooltipCard>
  );
}

function MarginTooltip({
  active,
  payload,
  grain,
}: TooltipProps<ChartPoint> & { grain: PointGrain }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  return (
    <TooltipCard
      title={formatTooltipDate(point.date, grain)}
      footnote={point.margin === null ? "Sem vendas" : <MarginFootnote margin={point.margin} />}
    >
      <TooltipRow color={REVENUE_COLOR} label="Receita" value={formatMoney(point.revenue)} />
      <TooltipRow color={PROFIT_COLOR} label="Lucro" value={formatMoney(point.profit)} strong />
    </TooltipCard>
  );
}

/** Same colors as the financial page's breakdown, so both screens tell the same story. */
const WATERFALL_COLORS: Record<WaterfallTone, string> = {
  revenue: REVENUE_COLOR,
  cost: "var(--finance-cost)",
  fee: "var(--finance-fee)",
  refund: "var(--finance-refund)",
  gain: "var(--brand)",
  profit: PROFIT_COLOR,
};

const WATERFALL_SHORT: Record<WaterfallTone, string> = {
  revenue: "Receita",
  cost: "Produtos",
  fee: "Taxas",
  refund: "Reembolsos",
  gain: "Comissões",
  profit: "Lucro",
};

function stepColor(step: WaterfallStep): string {
  if (step.key === "profit" && step.cents < 0) {
    return "var(--destructive)";
  }
  return WATERFALL_COLORS[step.key];
}

function WaterfallTooltip({
  active,
  payload,
  revenueCents,
}: TooltipProps<WaterfallStep> & { revenueCents: number }) {
  const step = payload?.[0]?.payload;
  if (!active || !step) {
    return null;
  }
  const share = revenueCents > 0 ? Math.round((Math.abs(step.cents) / revenueCents) * 100) : null;
  const isTotal = step.key === "revenue" || step.key === "profit";
  const direction = step.cents < 0 ? "Saiu" : "Entrou";
  return (
    <TooltipCard
      title={step.label}
      footnote={
        share === null || step.key === "revenue" ? null : (
          <>
            <span className="font-medium text-foreground">{share}%</span> da receita
          </>
        )
      }
    >
      <TooltipRow
        color={stepColor(step)}
        label={isTotal ? "Total" : direction}
        value={formatMoney(Math.abs(step.cents))}
        strong
      />
    </TooltipCard>
  );
}

// ── Shared frame ────────────────────────────────────────────────────────────

const CHART_MARGIN = { left: 0, right: 8, top: 24, bottom: 0 };
const LINE_CURSOR = { stroke: "var(--foreground)", strokeOpacity: 0.35, strokeDasharray: "4 4" };
const BAR_CURSOR = { fill: "var(--muted)", fillOpacity: 0.5 };

/**
 * Grid and axes every chart shares, so switching kinds never moves the frame. The grid is a
 * solid hairline (dashes are kept for reference lines); zero gets a firmer line when the chart
 * dips below it.
 */
function renderFrame({
  scale,
  formatY,
  xKey = "date",
  formatX = (value) => value,
  everyTick = false,
}: {
  scale: { domain: [number, number]; ticks: number[] };
  formatY: (value: number) => string;
  xKey?: string;
  formatX?: (value: string) => string;
  /** Categories (not dates): every one is labeled, none may be skipped. */
  everyTick?: boolean;
}) {
  return [
    <CartesianGrid key="grid" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />,
    <XAxis
      key="x"
      dataKey={xKey}
      tickLine={false}
      axisLine={false}
      tickMargin={12}
      minTickGap={40}
      interval={everyTick ? 0 : "preserveEnd"}
      tickFormatter={formatX}
    />,
    <YAxis
      key="y"
      width={68}
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      domain={scale.domain}
      ticks={scale.ticks}
      // A line sitting on zero keeps its whole stroke inside the plot.
      padding={{ top: 0, bottom: 4 }}
      tickFormatter={formatY}
    />,
    scale.domain[0] < 0 ? (
      <ReferenceLine key="zero" y={0} stroke="var(--foreground)" strokeOpacity={0.4} />
    ) : null,
  ];
}

function renderGradients() {
  return (
    <defs>
      <linearGradient id="cashRevenue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.12} />
        <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="cashProfit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.35} />
        <stop offset="100%" stopColor="var(--color-profit)" stopOpacity={0.02} />
      </linearGradient>
    </defs>
  );
}

/** Hover dot ringed with the card color, so it lifts off the line beneath it. */
function renderActiveDot(color: string, radius: number) {
  return ({ cx, cy }: { cx?: number | undefined; cy?: number | undefined }) => (
    <circle cx={cx} cy={cy} r={radius} fill={color} stroke="var(--card)" strokeWidth={2} />
  );
}

/** Every value the areas chart will draw, so the axis fits them all. */
function shownValues(
  data: readonly ChartPoint[],
  series: SeriesKey,
  layers: ChartLayers,
): number[] {
  return data.flatMap((point) => {
    const values: (number | null)[] = [];
    if (series !== "profit") {
      values.push(
        point.revenue,
        layers.compare && series === "revenue" ? point.previousRevenue : null,
      );
    }
    if (series !== "revenue") {
      values.push(point.profit, layers.compare ? point.previousProfit : null);
    }
    return values.filter((value) => value !== null);
  });
}

// ── Chart kinds ─────────────────────────────────────────────────────────────

/** The previous period, dashed and quiet behind the current one. */
function renderPreviousLine(
  dataKey:
    "previousRevenue" | "previousProfit" | "previousAverageRevenue" | "previousAverageProfit",
  color: string,
) {
  return (
    <Line
      key={dataKey}
      dataKey={dataKey}
      type="monotone"
      stroke={color}
      strokeOpacity={0.6}
      strokeWidth={1.5}
      strokeDasharray="5 5"
      dot={false}
      activeDot={false}
      isAnimationActive={false}
    />
  );
}

/** The 7-day average, the line that carries the trend once the daily values step back. */
function renderAverageLine(
  dataKey: "averageRevenue" | "averageProfit",
  color: string,
  width: number,
) {
  return (
    <Line
      key={dataKey}
      dataKey={dataKey}
      type="monotone"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      dot={false}
      activeDot={renderActiveDot(color, width + 3)}
      isAnimationActive={false}
    />
  );
}

/** Each series' daily area: full weight by default, a quiet outline under the 7-day average. */
const DAILY_AREAS = {
  revenue: {
    dataKey: "revenue",
    color: "var(--color-revenue)",
    gradient: "url(#cashRevenue)",
    opacity: 0.8,
    width: 2,
    dot: 5,
  },
  profit: {
    dataKey: "profit",
    color: "var(--color-profit)",
    gradient: "url(#cashProfit)",
    opacity: 1,
    width: 3,
    dot: 6,
  },
} as const;

function renderDailyArea(area: (typeof DAILY_AREAS)[keyof typeof DAILY_AREAS], smooth: boolean) {
  return (
    <Area
      key={area.dataKey}
      dataKey={area.dataKey}
      type="monotone"
      stroke={area.color}
      strokeOpacity={smooth ? 0.4 : area.opacity}
      strokeWidth={smooth ? 1.5 : area.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={smooth ? "none" : area.gradient}
      activeDot={smooth ? false : renderActiveDot(area.color, area.dot)}
      isAnimationActive={false}
    />
  );
}

/**
 * Revenue and profit as areas. With the 7-day average on, the daily areas step back and the
 * smooth lines carry the trend; with the comparison on, the previous period runs dashed behind.
 */
function CashAreas({
  data,
  series,
  grain,
  layers,
  cumulative = false,
}: {
  data: ChartPoint[];
  series: SeriesKey;
  grain: PointGrain;
  layers: ChartLayers;
  cumulative?: boolean;
}) {
  const scale = niceScale(shownValues(data, series, layers));
  const smooth = layers.average && !cumulative;
  const showRevenue = series !== "profit";
  const showProfit = series !== "revenue";
  return (
    <ChartContainer config={chartConfig} className="absolute inset-0 aspect-auto size-full">
      <ComposedChart data={data} margin={CHART_MARGIN}>
        {renderGradients()}
        {renderFrame({
          scale,
          formatY: formatMoneyTick,
          formatX: (value) => formatAxisDate(value, grain),
        })}
        <ChartTooltip
          cursor={LINE_CURSOR}
          content={
            <ProfitTooltip
              series={series}
              grain={grain}
              cumulative={cumulative}
              layers={{ ...layers, average: smooth }}
            />
          }
        />
        {/* One comparison line at a time: the profit's, unless only the revenue is shown. */}
        {layers.compare && !showProfit
          ? renderPreviousLine(
              smooth ? "previousAverageRevenue" : "previousRevenue",
              "var(--color-revenue)",
            )
          : null}
        {layers.compare && showProfit
          ? renderPreviousLine(
              smooth ? "previousAverageProfit" : "previousProfit",
              "var(--color-profit)",
            )
          : null}
        {showRevenue ? renderDailyArea(DAILY_AREAS.revenue, smooth) : null}
        {showProfit ? renderDailyArea(DAILY_AREAS.profit, smooth) : null}
        {smooth && showRevenue
          ? renderAverageLine("averageRevenue", "var(--color-revenue)", 2.5)
          : null}
        {smooth && showProfit ? renderAverageLine("averageProfit", "var(--color-profit)", 3) : null}
      </ComposedChart>
    </ChartContainer>
  );
}

const TOP_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

function stackedValues(data: readonly ChartPoint[], series: SeriesKey): number[] {
  return data.flatMap((point) => {
    if (series === "revenue") {
      return [point.revenue];
    }
    if (series === "profit") {
      return [point.profit];
    }
    return [Math.max(point.cost, 0) + Math.max(point.profit, 0), Math.min(point.profit, 0)];
  });
}

/** "Tudo" stacks costs under profit, so the full bar is the revenue; a loss hangs below zero. */
function CompositionBars({
  data,
  series,
  grain,
}: {
  data: ChartPoint[];
  series: SeriesKey;
  grain: PointGrain;
}) {
  const scale = niceScale(stackedValues(data, series));
  return (
    <ChartContainer config={chartConfig} className="absolute inset-0 aspect-auto size-full">
      <BarChart
        data={data}
        margin={CHART_MARGIN}
        stackOffset="sign"
        maxBarSize={grain === "month" ? 56 : 28}
      >
        {renderFrame({
          scale,
          formatY: formatMoneyTick,
          formatX: (value) => formatAxisDate(value, grain),
        })}
        <ChartTooltip cursor={BAR_CURSOR} content={<CompositionTooltip grain={grain} />} />
        {series === "all" ? (
          <Bar
            dataKey="cost"
            stackId="sale"
            fill="var(--color-revenue)"
            fillOpacity={0.3}
            isAnimationActive={false}
          />
        ) : null}
        {series === "revenue" ? (
          <Bar
            dataKey="revenue"
            fill="var(--color-revenue)"
            fillOpacity={0.7}
            radius={TOP_RADIUS}
            isAnimationActive={false}
          />
        ) : (
          <Bar
            dataKey="profit"
            stackId="sale"
            fill="var(--color-profit)"
            radius={TOP_RADIUS}
            isAnimationActive={false}
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}

/** Bar labels: "−R$ 11,9 mil" for thousands, whole reais below that ("−R$ 317"). */
function formatSignedCompact(value: unknown): string {
  const cents = Number(value);
  const sign = cents < 0 ? "−" : "";
  const absolute = Math.abs(cents);
  const formatted = absolute >= 100_000 ? axisMoney.format(absolute / 100) : formatMoney(absolute);
  return `${sign}${formatted}`;
}

/** Width of a 12px label, rounded up: about 6.6px per character in the app's font. */
function labelWidth(text: string): number {
  return Math.ceil(text.length * 6.6);
}

/** Bar labels without the currency, for the narrow layout: "−11,9 mil", "−317". */
function formatSignedBare(value: unknown): string {
  return formatSignedCompact(value).replace("R$", "").replace(/\s/u, "");
}

/** The element's width, kept current as it resizes; 0 before the first measure. */
function useElementWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return () => {};
    }
    // Measured right away too: the observer only reports on the next rendered frame.
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const VALUE_AXIS_WIDTH = 68;
const CATEGORY_AXIS_WIDTH = 92;
/** Room each column needs so its value label never runs into the next one. */
const LABEL_GAP = 12;

type WaterfallRow = WaterfallStep & { short: string };

/** Recharts reads the cells as direct children of the bar, so they come from a plain function. */
function renderWaterfallCells(steps: readonly WaterfallRow[]) {
  return steps.map((step) => (
    <Cell key={step.key} fill={stepColor(step)} fillOpacity={step.key === "revenue" ? 0.55 : 1} />
  ));
}

/** Columns, with the value above each one: used when every label fits over its own column. */
function WaterfallColumns({
  steps,
  revenueCents,
}: {
  steps: WaterfallRow[];
  revenueCents: number;
}) {
  const scale = niceScale(steps.flatMap((step) => step.range));
  return (
    <BarChart data={steps} margin={{ ...CHART_MARGIN, top: 32 }} maxBarSize={72}>
      {renderFrame({ scale, formatY: formatMoneyTick, xKey: "short", everyTick: true })}
      <ChartTooltip
        cursor={BAR_CURSOR}
        content={<WaterfallTooltip revenueCents={revenueCents} />}
      />
      <Bar dataKey="range" radius={4} isAnimationActive={false}>
        {renderWaterfallCells(steps)}
        <LabelList
          dataKey="cents"
          position="top"
          offset={8}
          className="fill-foreground text-xs font-medium"
          formatter={formatSignedCompact}
        />
      </Bar>
    </BarChart>
  );
}

/**
 * Rows, for narrow cards: names on the left, the value at the end of each bar. The value axis
 * stretches past the longest bar by exactly the room its label needs, so no label leaves the plot.
 */
function WaterfallRows({
  steps,
  revenueCents,
  width,
}: {
  steps: WaterfallRow[];
  revenueCents: number;
  width: number;
}) {
  const plotWidth = Math.max(width - CATEGORY_AXIS_WIDTH - CHART_MARGIN.right, 1);
  const labelRoom = Math.max(...steps.map((step) => labelWidth(formatSignedBare(step.cents)))) + 8;
  const low = Math.min(0, ...steps.map((step) => step.range[0]));
  const high = Math.max(...steps.map((step) => step.range[1]));
  const share = Math.min(labelRoom / plotWidth, 0.6);
  const top = high + ((high - low) * share) / (1 - share);
  return (
    <BarChart
      data={steps}
      layout="vertical"
      margin={{ left: 0, right: CHART_MARGIN.right, top: 0, bottom: 0 }}
      barCategoryGap="28%"
    >
      <XAxis type="number" hide domain={[low, top]} />
      <YAxis
        type="category"
        dataKey="short"
        width={CATEGORY_AXIS_WIDTH}
        tickLine={false}
        axisLine={false}
        interval={0}
      />
      <ChartTooltip
        cursor={BAR_CURSOR}
        content={<WaterfallTooltip revenueCents={revenueCents} />}
      />
      <Bar dataKey="range" radius={4} isAnimationActive={false}>
        {renderWaterfallCells(steps)}
        <LabelList
          dataKey="cents"
          position="right"
          offset={8}
          className="fill-foreground text-xs font-medium"
          formatter={formatSignedBare}
        />
      </Bar>
    </BarChart>
  );
}

/**
 * Revenue on the left, each deduction stepping down from it, profit standing on its own. Columns
 * while every value label fits over its column; rows once the card is too narrow for that.
 */
function WaterfallBars({ summary }: { summary: FlowSummary }) {
  const [ref, width] = useElementWidth();
  const steps = buildWaterfall(summary).map((step) => ({
    ...step,
    short: WATERFALL_SHORT[step.key],
  }));
  const widest = Math.max(
    ...steps.flatMap((step) => [
      labelWidth(formatSignedCompact(step.cents)),
      labelWidth(step.short),
    ]),
  );
  const columnWidth = (width - VALUE_AXIS_WIDTH - CHART_MARGIN.right) / steps.length;
  const fitsColumns = columnWidth >= widest + LABEL_GAP;
  return (
    <div ref={ref} className="absolute inset-0">
      {width === 0 ? null : (
        <ChartContainer config={chartConfig} className="size-full aspect-auto">
          {fitsColumns ? (
            <WaterfallColumns steps={steps} revenueCents={summary.revenueCents} />
          ) : (
            <WaterfallRows steps={steps} revenueCents={summary.revenueCents} width={width} />
          )}
        </ChartContainer>
      )}
    </div>
  );
}

/** Weekly margin against the period's own margin, the line it should stay above. */
function MarginLine({
  data,
  average,
  grain,
}: {
  data: ChartPoint[];
  average: number | null;
  grain: PointGrain;
}) {
  const margins = data.flatMap((point) => (point.margin === null ? [] : [point.margin]));
  const scale = niceScale(margins);
  return (
    <ChartContainer config={chartConfig} className="absolute inset-0 aspect-auto size-full">
      <LineChart data={data} margin={CHART_MARGIN}>
        {renderFrame({
          scale,
          formatY: formatPercentTick,
          formatX: (value) => formatAxisDate(value, grain),
        })}
        <ChartTooltip cursor={LINE_CURSOR} content={<MarginTooltip grain={grain} />} />
        {average === null ? null : (
          <ReferenceLine
            y={average}
            stroke="var(--foreground)"
            strokeOpacity={0.45}
            strokeDasharray="4 4"
          />
        )}
        <Line
          dataKey="margin"
          type="monotone"
          stroke="var(--color-profit)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={renderActiveDot("var(--color-profit)", 4)}
          activeDot={renderActiveDot("var(--color-profit)", 6)}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

function EmptyChart() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border text-center">
      <p className="text-sm font-medium">Sem vendas neste período</p>
      <p className="text-sm text-muted-foreground">Escolha outro período ou outra loja.</p>
    </div>
  );
}

interface ChartInput {
  points: MetricPoint[];
  previousPoints: MetricPoint[] | null;
  monthlyPoints: MetricPoint[] | null;
  bucket: "day" | "week";
  periodDays: number;
  summary: FlowSummary;
}

function ChartBody({
  kind,
  input,
  series,
  layers,
}: {
  kind: ChartKind;
  input: ChartInput;
  series: SeriesKey;
  layers: ChartLayers;
}) {
  const { points, previousPoints, monthlyPoints, bucket, periodDays, summary } = input;
  if (!hasSales(points)) {
    return <EmptyChart />;
  }
  if (kind === "waterfall") {
    return <WaterfallBars summary={summary} />;
  }
  if (kind === "bars") {
    // Long periods compare months; shorter ones keep the API's days or weeks.
    return (
      <CompositionBars
        data={buildChartPoints(monthlyPoints ?? points)}
        series={series}
        grain={monthlyPoints ? "month" : bucket}
      />
    );
  }
  if (kind === "margin") {
    // One small sale makes a daily margin spike; the margin is judged week by week.
    const weekly = bucket === "day" ? groupByWeek(points) : points;
    return (
      <MarginLine data={buildChartPoints(weekly)} average={periodMargin(points)} grain="week" />
    );
  }
  const cumulative = kind === "cumulative";
  const previous =
    layers.compare && previousPoints ? { points: previousPoints, offsetDays: periodDays } : null;
  return (
    <CashAreas
      data={buildChartPoints(points, { previous, cumulative })}
      series={series}
      grain={bucket}
      layers={layers}
      cumulative={cumulative}
    />
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

interface PeriodTotals {
  revenueCents: number;
  profitCents: number;
}

function totalsMargin(totals: PeriodTotals): number | null {
  if (totals.revenueCents <= 0) {
    return null;
  }
  return (totals.profitCents / totals.revenueCents) * 100;
}

function directionOf(delta: number): "up" | "down" | "flat" {
  if (delta > 0) {
    return "up";
  }
  if (delta < 0) {
    return "down";
  }
  return "flat";
}

/** Margin change in percentage points: "+2,1 p.p.". */
function MarginDelta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) {
    return null;
  }
  const delta = Math.round((current - previous) * 10) / 10;
  const direction = directionOf(delta);
  return (
    <DeltaBadge
      direction={direction}
      label={`${percent.format(Math.abs(delta))} p.p.`}
      suffix="vs. período anterior"
    />
  );
}

/**
 * The number the chart is about, before the drawing: the profit (or the margin, on the margin
 * chart) and how it moved against the previous period.
 */
function ChartHeadline({
  kind,
  current,
  previous,
}: {
  kind: ChartKind;
  current: PeriodTotals;
  previous: PeriodTotals;
}) {
  if (kind === "margin") {
    const margin = totalsMargin(current);
    return (
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">Margem no período</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-semibold tracking-tight">
            {margin === null ? "—" : `${percent.format(margin)}%`}
          </span>
          <MarginDelta current={margin} previous={totalsMargin(previous)} />
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">Lucro no período</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <MoneyFigure cents={current.profitCents} className="text-3xl" />
        <TrendBadge
          current={current.profitCents}
          previous={previous.profitCents}
          suffix="vs. período anterior"
        />
      </div>
    </div>
  );
}

const SOLID_KEY = <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-foreground/70" />;
const COST_KEY = <span aria-hidden="true" className="size-2.5 rounded-sm bg-muted-foreground/30" />;
const PROFIT_KEY = <span aria-hidden="true" className="size-2.5 rounded-sm bg-chart-brand" />;
const DASHED_KEY = (
  <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-foreground/50" />
);

/** What each extra line means, listed only while it is drawn. */
function legendItems(
  kind: ChartKind,
  layers: ChartLayers,
  bucket: "day" | "week",
  series: SeriesKey,
): { key: string; mark: ReactNode; text: string }[] {
  if (kind === "bars" && series === "all") {
    return [
      { key: "cost", mark: COST_KEY, text: "Custos e taxas" },
      { key: "profit", mark: PROFIT_KEY, text: "Lucro · a barra inteira é a receita" },
    ];
  }
  if (kind === "margin") {
    return [{ key: "period", mark: DASHED_KEY, text: "Tracejado: margem do período inteiro" }];
  }
  const items: { key: string; mark: ReactNode; text: string }[] = [];
  if (kind === "area" && bucket === "day" && layers.average) {
    items.push({ key: "average", mark: SOLID_KEY, text: "Linha cheia: média de 7 dias" });
  }
  if ((kind === "area" || kind === "cumulative") && layers.compare) {
    items.push({ key: "compare", mark: DASHED_KEY, text: "Tracejado: período anterior" });
  }
  return items;
}

function ChartLegend({
  kind,
  layers,
  bucket,
  series,
}: {
  kind: ChartKind;
  layers: ChartLayers;
  bucket: "day" | "week";
  series: SeriesKey;
}) {
  const items = legendItems(kind, layers, bucket, series);
  if (items.length === 0) {
    return null;
  }
  return (
    <ul className="mt-3 flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          {item.mark}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

/** What replaces the series pills on charts that draw a single, fixed set of marks. */
const KIND_CAPTIONS: Partial<Record<ChartKind, string>> = {
  waterfall: "Para onde foi cada real da receita",
  margin: "Lucro como % da receita, semana a semana",
};

function SeriesOrCaption({
  kind,
  series,
  onSeriesChange,
}: {
  kind: ChartKind;
  series: SeriesKey;
  onSeriesChange: (series: SeriesKey) => void;
}) {
  const caption = KIND_CAPTIONS[kind];
  if (caption) {
    return <p className="flex h-10 items-center text-sm text-muted-foreground">{caption}</p>;
  }
  return <SeriesPills value={series} onChange={onSeriesChange} />;
}

function ExportLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      aria-label="Exportar CSV do período"
      title="Exportar CSV do período"
      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <DownloadSimpleIcon className="size-4" aria-hidden="true" />
    </a>
  );
}

const KIND_TITLES: Record<ChartKind, string> = {
  area: "Receita e lucro",
  bars: "Composição da receita",
  waterfall: "Da receita ao lucro",
  margin: "Margem por semana",
  cumulative: "Receita e lucro acumulados",
};

/** The gear and the export, side by side. */
function ChartTools({
  menu,
  exportUrl,
}: {
  menu: ComponentProps<typeof ChartKindMenu>;
  exportUrl: string;
}) {
  return (
    <div className="flex shrink-0 gap-1.5 sm:gap-2">
      <ChartKindMenu {...menu} />
      <ExportLink href={exportUrl} />
    </div>
  );
}

/** The kind on screen: the one picked here, or else the saved default. */
function useChartKind() {
  const { defaultKind, setDefaultKind } = useDefaultChartKind();
  // Null until the owner picks a kind here, so a saved default still applies after hydration.
  const [pickedKind, setPickedKind] = useState<ChartKind | null>(null);
  return { kind: pickedKind ?? defaultKind, defaultKind, setPickedKind, setDefaultKind };
}

/** Kind and layers on screen, plus everything the gear menu needs to change them. */
function useChartMenu({
  bucket,
  previousPoints,
  boundary,
}: {
  bucket: "day" | "week";
  previousPoints: MetricPoint[] | null;
  boundary: HTMLElement | null;
}) {
  const [pickedLayers, setLayers] = useState<ChartLayers>({ compare: false, average: false });
  const { kind, defaultKind, setPickedKind, setDefaultKind } = useChartKind();
  const canAverage = bucket === "day";
  const canCompare = previousPoints !== null;
  // A layer whose switch is hidden (weekly buckets, no previous period) stays off on screen.
  const layers: ChartLayers = {
    average: pickedLayers.average && canAverage,
    compare: pickedLayers.compare && canCompare,
  };
  const menu: ComponentProps<typeof ChartKindMenu> = {
    kind,
    defaultKind,
    onKindChange: setPickedKind,
    onSetDefault: setDefaultKind,
    layers,
    onLayersChange: setLayers,
    canAverage,
    canCompare,
    boundary,
  };
  return { kind, layers, menu };
}

interface CashFlowChartProps {
  points: MetricPoint[];
  /** Same buckets for the previous period, for the comparison line. */
  previousPoints: MetricPoint[] | null;
  /** One point per month, sent for long periods. */
  monthlyPoints: MetricPoint[] | null;
  bucket: "day" | "week";
  /** Length of the period in days: how far the previous period is moved to sit under this one. */
  periodDays: number;
  summary: FlowSummary;
  previous: PeriodTotals;
  exportUrl: string;
  /** Period and store controls, shown in the chart's header next to the export. */
  filters?: ReactNode;
}

/**
 * Revenue and profit over the period, in the large chart card of the dashboard. Fixed rows, so
 * nothing depends on where a wrap happens: what the page shows (period, store) and the chart
 * tools; the headline number beside the series; then the chart. On phones the tools move down
 * next to the headline, so the period control and the series each get the card's full width.
 */
export function CashFlowChart({
  points,
  previousPoints,
  monthlyPoints,
  bucket,
  periodDays,
  summary,
  previous,
  exportUrl,
  filters,
}: CashFlowChartProps) {
  const [series, setSeries] = useState<SeriesKey>("all");
  const [card, setCard] = useState<HTMLElement | null>(null);
  const { kind, layers, menu } = useChartMenu({ bucket, previousPoints, boundary: card });
  const tools = <ChartTools menu={menu} exportUrl={exportUrl} />;
  return (
    <section
      ref={setCard}
      aria-labelledby="cash-flow-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <h2 id="cash-flow-title" className="sr-only">
        {KIND_TITLES[kind]}
      </h2>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{filters}</div>
        <div className="max-sm:hidden">{tools}</div>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex items-start justify-between gap-3 max-sm:w-full">
          <ChartHeadline kind={kind} current={summary} previous={previous} />
          <div className="sm:hidden">{tools}</div>
        </div>
        <SeriesOrCaption kind={kind} series={series} onSeriesChange={setSeries} />
      </div>
      <ChartLegend kind={kind} layers={layers} bucket={bucket} series={series} />
      {/* Grows to the height of the tiles beside it; never shorter than a readable chart. Nothing
          drawn may leave it, not even for a frame while the card resizes. */}
      <figure
        aria-label={`Gráfico: ${KIND_TITLES[kind].toLowerCase()}`}
        className="relative mt-5 min-h-72 flex-1 overflow-hidden"
      >
        <ChartBody
          kind={kind}
          input={{ points, previousPoints, monthlyPoints, bucket, periodDays, summary }}
          series={series}
          layers={layers}
        />
      </figure>
    </section>
  );
}
