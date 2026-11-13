import { TERM_HINTS } from "@/components/icons/action-icons";
import type { MetricPoint } from "@/features/reports/dashboard-metrics";
import { countTagParts, trendTagParts } from "@/features/reports/trend-tone";
import { MoneyFigure, TrendTag } from "./figures";
import { StatTile, type StatTileProps } from "./stat-tile";

const count = new Intl.NumberFormat("pt-BR");

/** A dashboard tile: every one leads to the financial page. */
function KpiTile(props: Omit<StatTileProps, "link">) {
  return (
    <StatTile
      {...props}
      link={{
        to: "/financeiro",
        spokenDestination: `Ver ${props.label.toLowerCase()} no financeiro`,
      }}
    />
  );
}

interface Totals {
  revenueCents: number;
  orders: number;
  averageTicketCents: number | null;
  cancelledOrders: number;
}

interface KpiTilesProps {
  summary: Totals;
  previous: Totals;
  points: readonly MetricPoint[];
}

const VERSUS = "vs. anterior";
const CANCELLED = { one: "cancelado", many: "cancelados" };

/**
 * Revenue, orders and average ticket, stacked beside the chart on wide screens. Each change is a
 * tag (green up, red down) and the sparkline wears the same color, so the column reads in a glance.
 */
export function KpiTiles({ summary, previous, points }: KpiTilesProps) {
  const sold = points.filter((point) => point.orders > 0);
  const revenue = trendTagParts(summary.revenueCents, previous.revenueCents);
  const orders = trendTagParts(summary.orders, previous.orders);
  const ticket = trendTagParts(summary.averageTicketCents, previous.averageTicketCents);
  return (
    <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
      <KpiTile
        label="Receita"
        hint="Ver a receita em detalhes no Financeiro"
        figure={<MoneyFigure cents={summary.revenueCents} />}
        change={<TrendTag parts={revenue} suffix={VERSUS} />}
        trend={points.map((point) => point.revenueCents)}
        trendTone={revenue?.tone ?? "neutral"}
      />
      <KpiTile
        label="Pedidos"
        hint="Ver os pedidos do período no Financeiro"
        figure={<span className="font-semibold">{count.format(summary.orders)}</span>}
        change={
          <>
            <TrendTag parts={orders} suffix={VERSUS} />
            <TrendTag
              parts={countTagParts(summary.cancelledOrders, previous.cancelledOrders, CANCELLED)}
            />
          </>
        }
        trend={points.map((point) => point.orders)}
        trendTone={orders?.tone ?? "neutral"}
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
        change={<TrendTag parts={ticket} suffix={VERSUS} />}
        trend={sold.map((point) => point.revenueCents / point.orders)}
        trendTone={ticket?.tone ?? "neutral"}
      />
    </div>
  );
}
