import { formatCents } from "@sellbridge/shared/money";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  revenue: {
    label: "Receita",
    theme: { light: "oklch(0.55 0.17 255)", dark: "oklch(0.7 0.15 255)" },
  },
  profit: { label: "Lucro", theme: { light: "oklch(0.6 0.15 160)", dark: "oklch(0.72 0.15 160)" } },
} satisfies ChartConfig;

const axisDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});
const compactMoney = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatAxisDate(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : axisDate.format(date);
}

function tooltipValue(value: unknown, name: unknown) {
  return (
    <div className="flex w-full justify-between gap-4">
      <span className="text-muted-foreground">{name === "revenue" ? "Receita" : "Lucro"}</span>
      <span className="font-medium tabular-nums">
        {typeof value === "number" ? formatCents(Math.round(value * 100)) : "—"}
      </span>
    </div>
  );
}

function dayLabel(value: unknown): string {
  return formatAxisDate(value);
}

function weekLabel(value: unknown): string {
  return `Semana de ${formatAxisDate(value)}`;
}

interface RevenueChartProps {
  points: { date: string; revenueCents: number; profitCents: number }[];
  bucket: "day" | "week";
}

export function RevenueChart({ points, bucket }: RevenueChartProps) {
  const data = points.map((point) => ({
    date: point.date,
    revenue: point.revenueCents / 100,
    profit: point.profitCents / 100,
  }));
  return (
    <figure aria-label={`Gráfico de receita e lucro por ${bucket === "week" ? "semana" : "dia"}`}>
      <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
        <AreaChart data={data} margin={{ left: 8, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={formatAxisDate}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={72}
            tickFormatter={(value: number) => compactMoney.format(value)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={bucket === "week" ? weekLabel : dayLabel}
                formatter={tooltipValue}
              />
            }
          />
          <Area
            dataKey="revenue"
            type="monotone"
            fill="url(#fillRevenue)"
            stroke="var(--color-revenue)"
            strokeWidth={2}
          />
          <Area
            dataKey="profit"
            type="monotone"
            fill="url(#fillProfit)"
            stroke="var(--color-profit)"
            strokeWidth={2}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
    </figure>
  );
}
