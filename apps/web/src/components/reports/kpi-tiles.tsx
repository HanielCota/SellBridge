import type { ReactNode } from "react";
import { TERM_HINTS } from "@/components/icons/action-icons";
import type { MetricPoint, PointGrain } from "@/features/reports/dashboard-metrics";
import { buildKpiStory, type KpiMeasure } from "@/features/reports/kpi-story";
import { countTagParts, trendTagParts, type TrendTagParts } from "@/features/reports/trend-tone";
import {
  CompareSparkline,
  countValue,
  MONEY_VALUE,
  type KpiValueFormat,
} from "./compare-sparkline";
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

interface KpiSeries {
  points: readonly MetricPoint[];
  previousPoints: readonly MetricPoint[] | null;
  bucket: Exclude<PointGrain, "month">;
  /** How many days the previous period starts before this one: the period's length. */
  offsetDays: number;
}

interface KpiTilesProps extends KpiSeries {
  summary: Totals;
  previous: Totals;
}

const VERSUS = "sobre o anterior";
const CANCELLED = { one: "cancelado", many: "cancelados" };
const ORDERS_VALUE = countValue({ one: "pedido", many: "pedidos" });

const REVENUE: KpiMeasure<MetricPoint> = { amount: (point) => point.revenueCents };
const ORDERS: KpiMeasure<MetricPoint> = { amount: (point) => point.orders };
const TICKET: KpiMeasure<MetricPoint> = {
  amount: (point) => point.revenueCents,
  per: (point) => point.orders,
};

function tileChart(
  series: KpiSeries,
  measure: KpiMeasure<MetricPoint>,
  parts: TrendTagParts | null,
  format: KpiValueFormat,
): ReactNode {
  const story = buildKpiStory(series.points, series.previousPoints, measure, series.offsetDays);
  return (
    <CompareSparkline
      story={story}
      bucket={series.bucket}
      tone={parts?.tone ?? "neutral"}
      format={format}
    />
  );
}

function TicketFigure({ cents }: { cents: number | null }) {
  if (cents === null) {
    return <span className="font-semibold">—</span>;
  }
  return <MoneyFigure cents={cents} />;
}

/**
 * Revenue, orders and average ticket, stacked beside the chart on wide screens. Each change is a
 * tag (green up, red down), and under it the period's line wears the same color, with the previous
 * period dashed behind it.
 */
export function KpiTiles({ summary, previous, ...series }: KpiTilesProps) {
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
        chart={tileChart(series, REVENUE, revenue, MONEY_VALUE)}
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
        chart={tileChart(series, ORDERS, orders, ORDERS_VALUE)}
      />
      <KpiTile
        label="Ticket médio"
        hint={`${TERM_HINTS.averageTicket}; veja mais no Financeiro`}
        isTerm
        figure={<TicketFigure cents={summary.averageTicketCents} />}
        change={<TrendTag parts={ticket} suffix={VERSUS} />}
        chart={tileChart(series, TICKET, ticket, MONEY_VALUE)}
      />
    </div>
  );
}
