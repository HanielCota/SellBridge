import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatPointDate, type MetricPoint } from "@/features/reports/dashboard-metrics";

/** Mint is reserved for profit (the hero metric); revenue is neutral context behind it. */
const REVENUE_COLOR = "var(--muted-foreground)";
const PROFIT_COLOR = "var(--chart-brand)";

const SERIES = [
  { key: "all", label: "Tudo", swatch: null },
  { key: "revenue", label: "Receita", swatch: REVENUE_COLOR },
  { key: "profit", label: "Lucro", swatch: PROFIT_COLOR },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const chartConfig = {
  revenue: { label: "Receita", color: REVENUE_COLOR },
  profit: { label: "Lucro", color: PROFIT_COLOR },
} satisfies ChartConfig;

interface ChartPoint {
  date: string;
  revenue: number;
  profit: number;
}

function SeriesPills({
  value,
  onChange,
}: {
  value: SeriesKey;
  onChange: (next: SeriesKey) => void;
}) {
  return (
    <fieldset className="inline-flex rounded-lg bg-muted p-0.5">
      <legend className="sr-only">Séries do gráfico</legend>
      {SERIES.map((series) => (
        <label
          key={series.key}
          className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
        >
          <input
            type="radio"
            name="cash-series"
            value={series.key}
            checked={series.key === value}
            onChange={() => onChange(series.key)}
            className="sr-only"
          />
          {series.swatch ? <Swatch color={series.swatch} /> : null}
          {series.label}
        </label>
      ))}
    </fieldset>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload?: ChartPoint }[];
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

/** Same color as the line it describes, so the card reads like a legend. */
function Swatch({ color }: { color: string }) {
  return (
    <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
  );
}

/** Quiet card: date, the two series the chart draws, and the margin as a footnote. */
function ProfitTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  const revenue = Math.round(point.revenue / 100);
  const profit = Math.round(point.profit / 100);
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  return (
    <div className="min-w-48 rounded-xl border border-border bg-popover px-3.5 py-3 text-popover-foreground shadow-md">
      <p className="text-xs text-muted-foreground">{formatPointDate(point.date)}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-sm">
        <Swatch color={REVENUE_COLOR} />
        <dt className="text-muted-foreground">Receita</dt>
        <dd className="text-right font-medium tabular-nums">{tooltipMoney.format(revenue)}</dd>
        <Swatch color={PROFIT_COLOR} />
        <dt className="text-muted-foreground">Lucro</dt>
        <dd className="text-right font-semibold tabular-nums">{tooltipMoney.format(profit)}</dd>
      </dl>
      {margin === null ? null : (
        <p className="mt-2.5 border-t border-border pt-2 text-xs text-muted-foreground">
          Margem de <span className="font-medium text-foreground">{margin}%</span>
        </p>
      )}
    </div>
  );
}

function renderGradients() {
  return (
    <defs>
      <linearGradient id="cashRevenue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.14} />
        <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
      </linearGradient>
      <linearGradient id="cashProfit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.45} />
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

function CashAreas({ data, series }: { data: ChartPoint[]; series: SeriesKey }) {
  return (
    <ChartContainer config={chartConfig} className="absolute inset-0 aspect-auto size-full">
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 24, bottom: 0 }}>
        {renderGradients()}
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          minTickGap={40}
          tickFormatter={(value: string) => formatPointDate(value)}
        />
        <YAxis
          width={68}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickCount={4}
          tickFormatter={(cents: number) => axisMoney.format(cents / 100)}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.35, strokeDasharray: "4 4" }}
          content={<ProfitTooltip />}
        />
        {series === "profit" ? null : (
          <Area
            dataKey="revenue"
            type="monotone"
            stroke="var(--color-revenue)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="url(#cashRevenue)"
            activeDot={renderActiveDot("var(--color-revenue)", 5)}
            isAnimationActive={false}
          />
        )}
        {series === "revenue" ? null : (
          <Area
            dataKey="profit"
            type="monotone"
            stroke="var(--color-profit)"
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="url(#cashProfit)"
            activeDot={renderActiveDot("var(--color-profit)", 6)}
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ChartContainer>
  );
}

/** Revenue and profit over the period, in the large chart card of the dashboard. */
export function CashFlowChart({
  points,
  bucket,
  exportUrl,
}: {
  points: MetricPoint[];
  bucket: "day" | "week";
  exportUrl: string;
}) {
  const [series, setSeries] = useState<SeriesKey>("all");
  const data = points.map((point) => ({
    date: point.date,
    revenue: point.revenueCents,
    profit: point.profitCents,
  }));
  return (
    <section aria-labelledby="cash-flow-title" className="surface-card rounded-3xl bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cash-flow-title" className="text-subhead font-medium text-muted-foreground">
          Receita e lucro por {bucket === "week" ? "semana" : "dia"}
        </h2>
        <div className="flex items-center gap-2">
          <SeriesPills value={series} onChange={setSeries} />
          <a
            href={exportUrl}
            aria-label="Exportar CSV do período"
            title="Exportar CSV do período"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <DownloadSimpleIcon className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
      <figure
        aria-label={`Gráfico de receita e lucro por ${bucket === "week" ? "semana" : "dia"}`}
        className="relative mt-5 h-72 sm:h-80"
      >
        <CashAreas data={data} series={series} />
      </figure>
    </section>
  );
}
