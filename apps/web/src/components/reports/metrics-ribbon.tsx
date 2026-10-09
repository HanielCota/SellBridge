import { formatCents } from "@sellbridge/shared/money";
import { cn } from "cn";
import { ArrowDownRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import {
  marginOf,
  type SummaryFigures,
  trendOf,
  type Trend,
} from "@/features/reports/dashboard-insights";

interface RibbonSummary extends SummaryFigures {
  averageTicketCents: number | null;
  cancelledOrders: number;
}

interface RibbonMetric {
  label: string;
  value: string;
  change: { text: string; isUp: boolean } | null;
  note?: string | undefined;
}

const percentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
});

function percentChangeText(trend: Trend): RibbonMetric["change"] {
  if (!trend || trend.direction === "flat") {
    return null;
  }
  const text = trend.isOffScale
    ? "> 10×"
    : `${trend.percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return { text, isUp: trend.direction === "up" };
}

function marginChangeText(current: number | null, previous: number | null): RibbonMetric["change"] {
  if (current === null || previous === null) {
    return null;
  }
  const points = Math.round((current - previous) * 100);
  return points === 0 ? null : { text: `${Math.abs(points)} p.p.`, isUp: points > 0 };
}

function buildMetrics(summary: RibbonSummary, previous: RibbonSummary): RibbonMetric[] {
  const margin = marginOf(summary);
  return [
    {
      label: "Receita",
      value: formatCents(summary.revenueCents),
      change: percentChangeText(trendOf(summary.revenueCents, previous.revenueCents)),
    },
    {
      label: "Lucro",
      value: formatCents(summary.profitCents),
      change: percentChangeText(trendOf(summary.profitCents, previous.profitCents)),
    },
    {
      label: "Margem",
      value: margin === null ? "—" : percentFormat.format(margin),
      change: marginChangeText(margin, marginOf(previous)),
    },
    {
      label: "Pedidos",
      value: summary.orders.toLocaleString("pt-BR"),
      change: percentChangeText(trendOf(summary.orders, previous.orders)),
      note: summary.cancelledOrders > 0 ? `${summary.cancelledOrders} cancelados` : undefined,
    },
    {
      label: "Ticket médio",
      value: summary.averageTicketCents === null ? "—" : formatCents(summary.averageTicketCents),
      change: percentChangeText(trendOf(summary.averageTicketCents, previous.averageTicketCents)),
    },
  ];
}

function MetricChange({ change }: { change: RibbonMetric["change"] }) {
  if (!change) {
    return <span className="text-muted-foreground">sem variação</span>;
  }
  const Icon = change.isUp ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        change.isUp ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {change.text}
      <span className="sr-only">{change.isUp ? " de aumento" : " de queda"}</span>
    </span>
  );
}

/** Headline numbers as type on the page, separated by hairlines instead of boxed in cards. */
export function MetricsRibbon({
  summary,
  previous,
}: {
  summary: RibbonSummary;
  previous: RibbonSummary;
}) {
  return (
    <dl className="grid grid-cols-2 gap-y-5 border-y py-5 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
      {buildMetrics(summary, previous).map((metric) => (
        <div key={metric.label} className="min-w-0 space-y-1 pr-4 lg:px-5 lg:first:pl-0">
          <dt className="text-[13px] text-muted-foreground">{metric.label}</dt>
          <dd className="truncate text-[22px] font-semibold tracking-[-0.02em]">{metric.value}</dd>
          <dd className="flex flex-wrap items-center gap-x-2 text-xs">
            <MetricChange change={metric.change} />
            {metric.note ? <span className="text-muted-foreground">{metric.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
