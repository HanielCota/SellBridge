import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { formatCents } from "@sellbridge/shared/money";
import { Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactNode } from "react";
import { OFF_SCALE_PERCENT } from "@/features/reports/dashboard-insights";
import type { MetricPoint } from "@/features/reports/dashboard-metrics";
import { CountFigure, MoneyFigure, ProgressRing } from "./figures";

interface TileProps {
  caption: string;
  label: string;
  to: NonNullable<LinkProps["to"]>;
  figure: ReactNode;
  visual: ReactNode;
}

function KpiTile({ caption, label, to, figure, visual }: TileProps) {
  return (
    <article className="relative flex min-h-36 flex-col justify-between rounded-3xl bg-card p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground">{caption}</span>
        <Link
          to={to}
          aria-label={`Ver detalhes de ${label.toLowerCase()}`}
          className="-m-1 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowUpRightIcon className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="flex h-11 items-end text-[34px] leading-none">{figure}</div>
        </div>
        {visual}
      </div>
    </article>
  );
}

function changeLabel(current: number, previous: number): { value: number; text: string } {
  if (previous <= 0) {
    return { value: current > 0 ? 1 : 0, text: "novo" };
  }
  const ratio = current / previous;
  const percent = Math.round((ratio - 1) * 100);
  if (percent >= OFF_SCALE_PERCENT) {
    // Almost no sales before: a percentage like +16841% means nothing and overflows the ring.
    return { value: 1, text: ">10×" };
  }
  return { value: ratio, text: `${percent > 0 ? "+" : ""}${percent}%` };
}

/** Average ticket of the last five buckets with sales; the latest one is highlighted. */
function TicketBars({ points }: { points: MetricPoint[] }) {
  const recent = points
    .filter((point) => point.orders > 0)
    .slice(-5)
    .map((point) => ({
      date: point.date,
      value: point.orders > 0 ? point.revenueCents / point.orders : 0,
    }));
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
  points: MetricPoint[];
}

export function KpiTiles({ caption, summary, previous, points }: KpiTilesProps) {
  const revenueChange = changeLabel(summary.revenueCents, previous.revenueCents);
  const totalOrders = summary.orders + summary.cancelledOrders;
  const completion = totalOrders > 0 ? summary.orders / totalOrders : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
      <KpiTile
        caption={caption}
        label="Receita"
        to="/financeiro"
        figure={<MoneyFigure cents={summary.revenueCents} />}
        visual={<ProgressRing value={revenueChange.value} label={revenueChange.text} />}
      />
      <KpiTile
        caption={caption}
        label="Pedidos"
        to="/financeiro"
        figure={<CountFigure value={summary.orders} />}
        visual={<ProgressRing value={completion} label={`${Math.round(completion * 100)}%`} />}
      />
      <KpiTile
        caption={caption}
        label="Ticket médio"
        to="/financeiro"
        figure={
          summary.averageTicketCents === null ? (
            "—"
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
