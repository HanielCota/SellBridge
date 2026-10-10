import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { formatPercentChange, trendOf } from "@/features/reports/dashboard-insights";
import type { MetricPoint } from "@/features/reports/dashboard-metrics";
import { cn } from "@/lib/utils";
import { MoneyFigure } from "./figures";

const count = new Intl.NumberFormat("pt-BR");

interface TileProps {
  /** Period the tile covers ("10 de set. – 9 de out. de 2026"). */
  caption: string;
  label: string;
  figure: ReactNode;
  visual: ReactNode;
}

/** Compact tile: period on top, the number at the bottom left and its visual beside it. */
function KpiTile({ caption, label, figure, visual }: TileProps) {
  return (
    <Link
      to="/financeiro"
      aria-label={`Ver ${label.toLowerCase()} no financeiro`}
      className="group surface-interactive flex min-h-36 flex-col justify-between gap-4 rounded-3xl bg-card p-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs text-muted-foreground">{caption}</span>
        <ArrowUpRightIcon
          className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
          aria-hidden="true"
        />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="flex h-11 items-end text-[34px] leading-none">{figure}</div>
        </div>
        {visual}
      </div>
    </Link>
  );
}

/** Circular gauge (0–1) with a short reading inside; `description` says what it measures. */
function ProgressRing({
  value,
  label,
  description,
}: {
  value: number;
  label: string;
  description: string;
}) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <span
      className="relative flex size-15 shrink-0 items-center justify-center"
      title={`${label} ${description}`}
    >
      <svg viewBox="0 0 60 60" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="30" cy="30" r={radius} fill="none" stroke="var(--muted)" strokeWidth="4" />
        <circle
          cx="30"
          cy="30"
          r={radius}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <span className="text-xs font-semibold tabular-nums">{label}</span>
      <span className="sr-only"> {description}</span>
    </span>
  );
}

/** Revenue against the previous period: the ring fills up as it catches up and is full once it matches. */
function revenueRing(current: number, previous: number): { value: number; label: string } {
  const trend = trendOf(current, previous);
  if (trend === null) {
    return { value: current > 0 ? 1 : 0, label: current > 0 ? "novo" : "—" };
  }
  if (trend.isOffScale) {
    // Almost no sales before: a percentage like +16.841% means nothing and overflows the ring.
    return { value: 1, label: ">10×" };
  }
  const signed = trend.direction === "down" ? -trend.percent : trend.percent;
  return { value: current / previous, label: formatPercentChange(signed) };
}

/** Average ticket of the last five buckets with sales; the latest one is highlighted. */
function TicketBars({ points }: { points: readonly MetricPoint[] }) {
  const recent = points
    .filter((point) => point.orders > 0)
    .slice(-5)
    .map((point) => ({ date: point.date, value: point.revenueCents / point.orders }));
  const max = Math.max(...recent.map((bar) => bar.value), 1);
  return (
    <span className="flex h-14 items-end gap-1" aria-hidden="true">
      {recent.map((bar, index) => (
        <span
          key={bar.date}
          className={cn("w-3 rounded-md", index === recent.length - 1 ? "bg-brand" : "bg-muted")}
          style={{ height: `${Math.max(12, (bar.value / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

interface KpiTilesProps {
  caption: string;
  summary: {
    revenueCents: number;
    orders: number;
    cancelledOrders: number;
    averageTicketCents: number | null;
  };
  previous: { revenueCents: number };
  points: readonly MetricPoint[];
}

/** Revenue, orders and average ticket, stacked beside the chart on wide screens. */
export function KpiTiles({ caption, summary, previous, points }: KpiTilesProps) {
  const revenue = revenueRing(summary.revenueCents, previous.revenueCents);
  const totalOrders = summary.orders + summary.cancelledOrders;
  const completion = totalOrders > 0 ? summary.orders / totalOrders : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
      <KpiTile
        caption={caption}
        label="Receita"
        figure={<MoneyFigure cents={summary.revenueCents} />}
        visual={
          <ProgressRing
            value={revenue.value}
            label={revenue.label}
            description="em relação ao período anterior"
          />
        }
      />
      <KpiTile
        caption={caption}
        label="Pedidos"
        figure={<span className="font-semibold tabular-nums">{count.format(summary.orders)}</span>}
        visual={
          <ProgressRing
            value={completion}
            label={`${Math.round(completion * 100)}%`}
            description="dos pedidos concluídos"
          />
        }
      />
      <KpiTile
        caption={caption}
        label="Ticket médio"
        figure={
          summary.averageTicketCents === null ? (
            <span className="font-semibold">—</span>
          ) : (
            <MoneyFigure cents={summary.averageTicketCents} />
          )
        }
        visual={<TicketBars points={points} />}
      />
      <span className="sr-only">
        Ticket médio{" "}
        {summary.averageTicketCents === null
          ? "sem vendas"
          : formatCents(summary.averageTicketCents)}
      </span>
    </div>
  );
}
