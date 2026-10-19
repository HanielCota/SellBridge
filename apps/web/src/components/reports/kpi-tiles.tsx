import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ACTION_ICONS, TERM_HINTS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { MetricPoint } from "@/features/reports/dashboard-metrics";
import { MoneyFigure, Sparkline, TrendBadge } from "./figures";

const count = new Intl.NumberFormat("pt-BR");

interface TileProps {
  label: string;
  figure: ReactNode;
  /** How the figure moved against the previous period, plus any short note. */
  change: ReactNode;
  /** The figure's shape over the period. */
  trend: readonly number[];
  /** Tooltip on the whole tile: where it leads, and what the name means when it is jargon. */
  hint: string;
  /** Dotted underline on a name a reseller may not know; the hint explains it. */
  isTerm?: boolean;
}

const SeeAllIcon = ACTION_ICONS.seeAll.icon;

/**
 * One stat tile: name, the number, how it moved and a sparkline. Every tile has the same parts in
 * the same places, so the column reads in one pass. The period lives in the page header.
 */
function KpiTile({ label, figure, change, trend, hint, isTerm = false }: TileProps) {
  return (
    <Hint label={hint} openOnTap={false}>
      <Link
        to="/financeiro"
        aria-label={`Ver ${label.toLowerCase()} no financeiro`}
        className="group surface-interactive flex min-h-36 flex-col justify-between gap-3 rounded-3xl bg-card p-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-3">
          <span className={cn("text-sm text-muted-foreground", isTerm && "hinted-term")}>
            {label}
          </span>
          <SeeAllIcon
            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex h-9 items-end text-[30px] leading-none">{figure}</div>
            <div className="flex min-h-4 flex-wrap items-center gap-x-1.5 text-xs">{change}</div>
          </div>
          <Sparkline values={trend} className="mb-1" />
        </div>
      </Link>
    </Hint>
  );
}

interface Totals {
  revenueCents: number;
  orders: number;
  averageTicketCents: number | null;
}

interface KpiTilesProps {
  summary: Totals & { cancelledOrders: number };
  previous: Totals;
  points: readonly MetricPoint[];
}

const VERSUS = "vs. anterior";

/** Revenue, orders and average ticket, stacked beside the chart on wide screens. */
export function KpiTiles({ summary, previous, points }: KpiTilesProps) {
  const sold = points.filter((point) => point.orders > 0);
  return (
    <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
      <KpiTile
        label="Receita"
        hint="Ver a receita em detalhes no Financeiro"
        figure={<MoneyFigure cents={summary.revenueCents} />}
        change={
          <TrendBadge
            current={summary.revenueCents}
            previous={previous.revenueCents}
            suffix={VERSUS}
          />
        }
        trend={points.map((point) => point.revenueCents)}
      />
      <KpiTile
        label="Pedidos"
        hint="Ver os pedidos do período no Financeiro"
        figure={<span className="font-semibold">{count.format(summary.orders)}</span>}
        change={
          <>
            <TrendBadge current={summary.orders} previous={previous.orders} suffix={VERSUS} />
            {summary.cancelledOrders > 0 ? (
              <span className="text-muted-foreground">
                · {count.format(summary.cancelledOrders)}{" "}
                {summary.cancelledOrders === 1 ? "cancelado" : "cancelados"}
              </span>
            ) : null}
          </>
        }
        trend={points.map((point) => point.orders)}
      />
      <KpiTile
        label="Ticket médio"
        hint={`${TERM_HINTS.averageTicket}; veja mais no Financeiro`}
        isTerm
        figure={
          summary.averageTicketCents === null ? (
            <span className="font-semibold">—</span>
          ) : (
            <MoneyFigure cents={summary.averageTicketCents} />
          )
        }
        change={
          <TrendBadge
            current={summary.averageTicketCents}
            previous={previous.averageTicketCents}
            suffix={VERSUS}
          />
        }
        trend={sold.map((point) => point.revenueCents / point.orders)}
      />
    </div>
  );
}
