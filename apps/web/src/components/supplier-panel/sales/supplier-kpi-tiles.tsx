import type { SupplierSalesPoint, SupplierSalesSummary } from "@sellbridge/database/repositories";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { MoneyFigure, TrendBadge } from "@/components/reports/figures";
import { StatTile, type StatTileProps } from "@/components/reports/stat-tile";

const count = new Intl.NumberFormat("pt-BR");

const VERSUS = "vs. anterior";

interface SupplierKpiTilesProps {
  summary: SupplierSalesSummary;
  previous: SupplierSalesSummary;
  points: readonly SupplierSalesPoint[];
}

/** A supplier tile: every one leads to the orders, the supplier's detail page. */
function KpiTile(props: Omit<StatTileProps, "link">) {
  return (
    <StatTile
      {...props}
      link={{
        to: "/fornecedor/painel/pedidos",
        ariaLabel: `Ver ${props.label.toLowerCase()} nos pedidos`,
      }}
    />
  );
}

function Count({ value }: { value: number }) {
  return <span className="font-semibold">{count.format(value)}</span>;
}

/**
 * The reseller dashboard's tiles with the supplier's numbers (item 38): what it receives, the
 * orders, the pieces and the average order. They open the orders, the supplier's detail page.
 */
export function SupplierKpiTiles({ summary, previous, points }: SupplierKpiTilesProps) {
  const sold = points.filter((point) => point.orders > 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      <KpiTile
        label="A receber"
        hint={`${TERM_HINTS.supplierReceivable}; veja os pedidos`}
        isTerm
        figure={<MoneyFigure cents={summary.receivableCents} />}
        change={
          <TrendBadge
            current={summary.receivableCents}
            previous={previous.receivableCents}
            suffix={VERSUS}
          />
        }
        trend={points.map((point) => point.receivableCents)}
      />
      <KpiTile
        label="Pedidos"
        hint="Ver os pedidos dos revendedores"
        figure={<Count value={summary.orders} />}
        change={<TrendBadge current={summary.orders} previous={previous.orders} suffix={VERSUS} />}
        trend={points.map((point) => point.orders)}
      />
      <KpiTile
        label="Peças vendidas"
        hint="Unidades dos seus produtos nos pedidos do período"
        figure={<Count value={summary.units} />}
        change={<TrendBadge current={summary.units} previous={previous.units} suffix={VERSUS} />}
        trend={points.map((point) => point.units)}
      />
      <KpiTile
        label="Valor médio por pedido"
        hint={`${TERM_HINTS.supplierAverageOrder}; veja os pedidos`}
        isTerm
        figure={
          summary.averageOrderCents === null ? (
            <span className="font-semibold">—</span>
          ) : (
            <MoneyFigure cents={summary.averageOrderCents} />
          )
        }
        change={
          <TrendBadge
            current={summary.averageOrderCents}
            previous={previous.averageOrderCents}
            suffix={VERSUS}
          />
        }
        trend={sold.map((point) => point.receivableCents / point.orders)}
      />
    </div>
  );
}
