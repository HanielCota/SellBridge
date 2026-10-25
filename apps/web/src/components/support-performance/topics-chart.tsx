import type { SeriesPoint, SupportPerformanceReport } from "@sellbridge/shared/support-performance";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { TooltipCard, TooltipRow, type TooltipProps } from "@/components/reports/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceScale } from "@/features/reports/chart-view";
import { bucketLabel, bucketTitle } from "@/features/support/performance-format";

/*
 * Tickets per topic in each bucket, stacked. Colors are the app's own chart and finance tones,
 * which differ in lightness as well as hue; account and "other" share the neutral grey.
 */

const GROUPS = [
  { key: "order", label: "Pedido ou entrega", categories: ["order"], color: "var(--chart-brand)" },
  {
    key: "payment",
    label: "Dinheiro e cobrança",
    categories: ["payment"],
    color: "var(--finance-cost)",
  },
  { key: "store", label: "Loja conectada", categories: ["store"], color: "var(--finance-fee)" },
  {
    key: "listing",
    label: "Anúncios e produtos",
    categories: ["listing"],
    color: "var(--finance-refund)",
  },
  {
    key: "rest",
    label: "Conta e outros",
    categories: ["account", "other"],
    color: "var(--muted-foreground)",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  categories: readonly TicketCategory[];
  color: string;
}[];

type GroupKey = (typeof GROUPS)[number]["key"];
type TopicPoint = { start: string; total: number } & Record<GroupKey, number>;

const config = Object.fromEntries(
  GROUPS.map((group) => [group.key, { label: group.label, color: group.color }]),
) satisfies ChartConfig;

const count = new Intl.NumberFormat("pt-BR");

function sumOf(point: SeriesPoint, categories: readonly TicketCategory[]): number {
  return categories.reduce((sum, category) => sum + (point.openedByCategory[category] ?? 0), 0);
}

function toPoint(point: SeriesPoint): TopicPoint {
  const values = {
    order: sumOf(point, ["order"]),
    payment: sumOf(point, ["payment"]),
    store: sumOf(point, ["store"]),
    listing: sumOf(point, ["listing"]),
    rest: sumOf(point, ["account", "other"]),
  };
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  return { start: point.start, total, ...values };
}

function TopicsTooltip({
  active,
  payload,
  bucket,
}: TooltipProps<TopicPoint> & { bucket: "day" | "week" }) {
  const point = payload?.[0]?.payload;
  if (!active || point === undefined) {
    return null;
  }
  return (
    <TooltipCard title={bucketTitle(point.start, bucket)}>
      {GROUPS.map((group) => (
        <TooltipRow
          key={group.key}
          color={group.color}
          label={group.label}
          value={count.format(point[group.key])}
        />
      ))}
    </TooltipCard>
  );
}

export function TopicsLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      {GROUPS.map((group) => (
        <li key={group.key} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: group.color }}
          />
          {group.label}
        </li>
      ))}
    </ul>
  );
}

export function TopicsChart({ report }: { report: SupportPerformanceReport }) {
  const data = report.series.map(toPoint);
  const scale = niceScale(data.map((point) => point.total));
  return (
    <ChartContainer config={config} className="absolute inset-0 aspect-auto size-full">
      <BarChart data={data} margin={{ left: 0, right: 8, top: 16, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
        <XAxis
          dataKey="start"
          tickLine={false}
          axisLine={false}
          tickMargin={12}
          minTickGap={24}
          interval="preserveStartEnd"
          tickFormatter={(value: string) => bucketLabel(value, report.bucket)}
        />
        <YAxis
          width="auto"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          domain={scale.domain}
          ticks={scale.ticks}
          allowDecimals={false}
          padding={{ top: 0, bottom: 4 }}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.5 }}
          content={<TopicsTooltip bucket={report.bucket} />}
        />
        {GROUPS.map((group) => (
          <Bar
            key={group.key}
            dataKey={group.key}
            stackId="topics"
            fill={group.color}
            maxBarSize={48}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
