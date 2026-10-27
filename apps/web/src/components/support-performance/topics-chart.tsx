import type {
  SeriesPoint,
  SupportBucket,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { useState } from "react";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { TooltipCard, TooltipRow, type TooltipProps } from "@/components/reports/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { niceScale } from "@/features/reports/chart-view";
import {
  bucketLabel,
  bucketTitle,
  previousBucketText,
  subjectLabel,
} from "@/features/support/performance-format";
import { formatPercent } from "@/lib/percent";

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
type TopicPoint = { start: string; total: number; top: Partial<Record<GroupKey, string>> } & Record<
  GroupKey,
  number
>;

const config = Object.fromEntries(
  GROUPS.map((group) => [group.key, { label: group.label, color: group.color }]),
) satisfies ChartConfig;

const count = new Intl.NumberFormat("pt-BR");

function sumOf(point: SeriesPoint, categories: readonly TicketCategory[]): number {
  return categories.reduce((sum, category) => sum + (point.openedByCategory[category] ?? 0), 0);
}

/** The situation most picked in the group's first topic that has one, as the form calls it. */
function topLabel(point: SeriesPoint, categories: readonly TicketCategory[]): string | undefined {
  for (const category of categories) {
    const situationId = point.topSituationByCategory[category];
    if (situationId === undefined) {
      continue;
    }
    // The topic's id is shared by both kinds of customer; the reseller form is tried first.
    const seller = subjectLabel({ origin: "seller", category, situationId });
    return seller === "Situação antiga"
      ? subjectLabel({ origin: "supplier", category, situationId })
      : seller;
  }
  return undefined;
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
  const top = Object.fromEntries(
    GROUPS.flatMap((group) => {
      const label = topLabel(point, group.categories);
      return label === undefined ? [] : [[group.key, label]];
    }),
  );
  return { start: point.start, total, top, ...values };
}

/**
 * The card of one coloured block: that topic in that bucket, its share of the bucket, how it
 * moved against the bucket before and the situation customers picked most.
 */
function TopicsTooltip({
  active,
  payload,
  bucket,
  hovered,
  points,
}: TooltipProps<TopicPoint> & {
  bucket: SupportBucket;
  hovered: GroupKey | null;
  points: readonly TopicPoint[];
}) {
  const point = payload?.[0]?.payload;
  const group = GROUPS.find((item) => item.key === hovered);
  if (!active || point === undefined || group === undefined) {
    return null;
  }
  const index = points.findIndex((item) => item.start === point.start);
  const before = points[index - 1];
  const value = point[group.key];
  const difference = before === undefined ? null : value - before[group.key];
  const top = point.top[group.key];
  return (
    <TooltipCard
      title={bucketTitle(point.start, bucket)}
      footnote={top === undefined ? undefined : `Mais comum: ${top}`}
    >
      <TooltipRow color={group.color} label={group.label} value={count.format(value)} strong />
      <dt className="col-span-2 text-muted-foreground">Do total</dt>
      <dd className="text-right font-medium tabular-nums">
        {point.total === 0 ? "—" : formatPercent(value / point.total)}
      </dd>
      {difference === null ? null : (
        <p
          className={
            difference > 0
              ? "col-span-3 text-xs font-medium text-destructive"
              : difference < 0
                ? "col-span-3 text-xs font-medium text-brand-text"
                : "col-span-3 text-xs text-muted-foreground"
          }
        >
          {difference === 0
            ? `Igual ${previousBucketText(bucket).replace(/^a /, "à ").replace(/^o /, "ao ")}`
            : `${difference > 0 ? "↑" : "↓"} ${count.format(Math.abs(difference))} vs. ${previousBucketText(bucket)}`}
        </p>
      )}
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
  // The block under the pointer: its card shows that topic only, the others step back.
  const [hovered, setHovered] = useState<GroupKey | null>(null);
  const scale = niceScale(data.map((point) => point.total));
  return (
    <ChartContainer config={config} className="absolute inset-0 aspect-auto size-full">
      <BarChart
        data={data}
        margin={{ left: 0, right: 8, top: 16, bottom: 4 }}
        onMouseLeave={() => setHovered(null)}
      >
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
          content={<TopicsTooltip bucket={report.bucket} hovered={hovered} points={data} />}
        />
        {GROUPS.map((group) => (
          <Bar
            key={group.key}
            dataKey={group.key}
            stackId="topics"
            fill={group.color}
            fillOpacity={hovered === null || hovered === group.key ? 1 : 0.35}
            maxBarSize={48}
            isAnimationActive={false}
            onMouseEnter={() => setHovered(group.key)}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
