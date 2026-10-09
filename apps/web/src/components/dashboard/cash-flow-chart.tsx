import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatPointDate, type MetricPoint } from "@/features/reports/dashboard-metrics";
import { MoneyFigure } from "./figures";

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

/** Mint card: what came in, what went out, and the profit as the big number. */
function ProfitTooltip({ active, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  const costs = Math.max(point.revenue - point.profit, 0);
  const max = Math.max(point.revenue, 1);
  return (
    <div className="w-60 rounded-3xl bg-brand p-4 text-primary-foreground shadow-2xl shadow-black/40">
      <p className="text-right text-xs font-medium opacity-70">{formatPointDate(point.date)}</p>
      <div className="mt-2 flex h-20 items-end gap-2">
        <TooltipBar
          label="Receita"
          cents={point.revenue}
          height={point.revenue / max}
          tone="dark"
        />
        <TooltipBar label="Custos" cents={costs} height={costs / max} tone="mid" />
      </div>
      <p className="mt-3 text-xs font-medium opacity-70">Lucro</p>
      <MoneyFigure
        cents={point.profit}
        className="text-3xl leading-none [&>span]:text-primary-foreground/60"
      />
    </div>
  );
}

function TooltipBar({
  label,
  cents,
  height,
  tone,
}: {
  label: string;
  cents: number;
  height: number;
  tone: "dark" | "mid";
}) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-1">
      <span className="text-[11px] font-semibold tabular-nums">
        {label} R$ {Math.round(cents / 100).toLocaleString("pt-BR")}
      </span>
      <span
        className={cn(
          "rounded-xl",
          tone === "dark" ? "bg-primary-foreground" : "bg-primary-foreground/35",
        )}
        style={{ height: `${Math.max(10, height * 56)}px` }}
      />
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
