import { TERM_HINTS } from "@/components/icons/action-icons";
import type { MetricPoint } from "@/features/reports/dashboard-metrics";
import { MoneyFigure, TrendBadge } from "./figures";
import { StatTile, type StatTileProps } from "./stat-tile";

const count = new Intl.NumberFormat("pt-BR");

/** A dashboard tile: every one leads to the financial page. */
function KpiTile(props: Omit<StatTileProps, "link">) {
  return (
    <StatTile
      {...props}
      link={{ to: "/financeiro", ariaLabel: `Ver ${props.label.toLowerCase()} no financeiro` }}
    />
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
