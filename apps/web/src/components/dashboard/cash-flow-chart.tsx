import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatPointDate, type MetricPoint } from "@/features/reports/dashboard-metrics";

const SERIES = [
  { key: "all", label: "Tudo" },
  { key: "revenue", label: "Receita" },
  { key: "profit", label: "Lucro" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const chartConfig = {
  revenue: { label: "Receita", color: "var(--chart-brand)" },
  profit: { label: "Lucro", color: "var(--muted-foreground)" },
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
    <fieldset className="flex flex-wrap gap-1.5">
      <legend className="sr-only">Séries do gráfico</legend>
      {SERIES.map((series) => (
        <label
          key={series.key}
          className="flex h-10 cursor-pointer items-center rounded-full border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:font-medium has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
        >
          <input
            type="radio"
            name="cash-series"
            value={series.key}
            checked={series.key === value}
            onChange={() => onChange(series.key)}
            className="sr-only"
          />
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

/** Mint card, built to be read at a glance: profit first, then where the revenue went. */
function ProfitTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  // Round once, then derive costs, so "receita − custos = lucro" always adds up on screen.
  const revenue = Math.round(point.revenue / 100);
  const profit = Math.round(point.profit / 100);
  const costs = Math.max(revenue - profit, 0);
  const profitShare = revenue > 0 ? Math.min(Math.max(profit / revenue, 0), 1) : 0;
  return (
    <div className="w-64 rounded-2xl bg-brand p-4 text-primary-foreground shadow-2xl shadow-black/50">
      <p className="text-sm font-semibold">{formatPointDate(point.date)}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium">Lucro</p>
          <p className="text-[28px] leading-none font-semibold tracking-[-0.02em]">
            {tooltipMoney.format(profit)}
          </p>
        </div>
        {revenue > 0 ? (
          <p className="rounded-full bg-primary-foreground px-2.5 py-1 text-xs font-semibold text-brand-text">
            {Math.round(profitShare * 100)}% de margem
          </p>
        ) : null}
      </div>
      <div
        className="mt-3 flex h-2 overflow-hidden rounded-full bg-primary-foreground/20"
        aria-hidden="true"
      >
        <span className="h-full bg-primary-foreground" style={{ width: `${profitShare * 100}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="font-medium">Receita</dt>
        <dd className="text-right font-semibold tabular-nums">{tooltipMoney.format(revenue)}</dd>
        <dt className="font-medium">Custos e taxas</dt>
        <dd className="text-right font-semibold tabular-nums">{tooltipMoney.format(costs)}</dd>
      </dl>
    </div>
  );
}

function renderGradients() {
  return (
    <defs>
      <linearGradient id="cashRevenue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.55} />
        <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0.03} />
      </linearGradient>
      <linearGradient id="cashProfit" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.35} />
        <stop offset="100%" stopColor="var(--color-profit)" stopOpacity={0.02} />
      </linearGradient>
    </defs>
  );
}

function CashAreas({ data, series }: { data: ChartPoint[]; series: SeriesKey }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[340px] w-full">
      <AreaChart data={data} margin={{ left: 0, right: 0, top: 24, bottom: 0 }}>
        {renderGradients()}
        <CartesianGrid vertical={false} stroke="var(--border)" />
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
            strokeWidth={2}
            fill="url(#cashRevenue)"
            isAnimationActive={false}
          />
        )}
        {series === "revenue" ? null : (
          <Area
            dataKey="profit"
            type="monotone"
            stroke="var(--foreground)"
            strokeOpacity={0.7}
            strokeWidth={1.5}
            fill="url(#cashProfit)"
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
    <section
      aria-labelledby="cash-flow-title"
      className="flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <h2 id="cash-flow-title" className="sr-only">
        Receita e lucro por {bucket === "week" ? "semana" : "dia"}
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeriesPills value={series} onChange={setSeries} />
        <a
          href={exportUrl}
          aria-label="Exportar CSV do período"
          title="Exportar CSV do período"
          className="flex size-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <DownloadSimpleIcon className="size-4" aria-hidden="true" />
        </a>
      </div>
      <figure
        aria-label={`Gráfico de receita e lucro por ${bucket === "week" ? "semana" : "dia"}`}
        className="mt-auto pt-4"
      >
        <CashAreas data={data} series={series} />
      </figure>
    </section>
  );
}
