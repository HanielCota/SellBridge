import type { SupplierSalesPoint, SupplierSalesSummary } from "@sellbridge/database/repositories";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { MoneyFigure, TrendTag } from "@/components/reports/figures";
import type { SupplierSalesSituation } from "@sellbridge/shared/supplier-panel-sales";
import { StatTile, type StatTileProps } from "@/components/reports/stat-tile";
import { trendTagParts } from "@/features/reports/trend-tone";
import {
  supplierAmountLabels,
  supplierTrendPolarity,
} from "@/features/supplier-panel/sales/amount-labels";

const count = new Intl.NumberFormat("pt-BR");

const VERSUS = "vs. anterior";

interface SupplierKpiTilesProps {
  summary: SupplierSalesSummary;
  previous: SupplierSalesSummary;
  points: readonly SupplierSalesPoint[];
  situation: SupplierSalesSituation;
  /** The grid; the home stacks the tiles beside its chart, the Vendas page lays them in a row. */
  className?: string;
}

/** A supplier tile: every one leads to the orders, the supplier's detail page. */
function KpiTile(props: Omit<StatTileProps, "link">) {
  return (
    <StatTile
      {...props}
      link={{
        to: "/fornecedor/painel/pedidos",
        spokenDestination: `Ver ${props.label.toLowerCase()} nos pedidos`,
      }}
    />
  );
}

function Count({ value }: { value: number }) {
  return <span className="font-semibold">{count.format(value)}</span>;
}

/** The first tile's name and hint: the money to receive, or the money left out. */
function amountTileName(situation: SupplierSalesSituation) {
  const label = supplierAmountLabels(situation).amount;
  if (situation === "lost") {
    return {
      label,
      hint: "O que deixou de entrar com os pedidos cancelados ou devolvidos; veja os pedidos",
    };
  }
  return { label, hint: `${TERM_HINTS.supplierReceivable}; veja os pedidos`, isTerm: true };
}

/**
 * The reseller dashboard's tiles with the supplier's numbers (item 38): what it receives, the
 * orders, the pieces and the average order. They open the orders, the supplier's detail page.
 */
export function SupplierKpiTiles({
  summary,
  previous,
  points,
  situation,
  className = "grid gap-4 sm:grid-cols-2 xl:grid-cols-1",
}: SupplierKpiTilesProps) {
  const sold = points.filter((point) => point.orders > 0);
  const labels = supplierAmountLabels(situation);
  const polarity = supplierTrendPolarity(situation);
  const amount = trendTagParts(summary.receivableCents, previous.receivableCents, polarity);
  const orders = trendTagParts(summary.orders, previous.orders, polarity);
  const units = trendTagParts(summary.units, previous.units, polarity);
  const average = trendTagParts(summary.averageOrderCents, previous.averageOrderCents, polarity);
  return (
    <div className={className}>
      <KpiTile
        {...amountTileName(situation)}
        figure={<MoneyFigure cents={summary.receivableCents} />}
        change={<TrendTag parts={amount} suffix={VERSUS} />}
        trend={points.map((point) => point.receivableCents)}
        trendTone={amount?.tone ?? "neutral"}
      />
      <KpiTile
        label="Pedidos"
        hint="Ver os pedidos dos revendedores"
        figure={<Count value={summary.orders} />}
        change={<TrendTag parts={orders} suffix={VERSUS} />}
        trend={points.map((point) => point.orders)}
        trendTone={orders?.tone ?? "neutral"}
      />
      <KpiTile
        label={labels.units}
        hint="Unidades dos seus produtos nos pedidos do período"
        figure={<Count value={summary.units} />}
        change={<TrendTag parts={units} suffix={VERSUS} />}
        trend={points.map((point) => point.units)}
        trendTone={units?.tone ?? "neutral"}
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
        change={<TrendTag parts={average} suffix={VERSUS} />}
        trend={sold.map((point) => point.receivableCents / point.orders)}
        trendTone={average?.tone ?? "neutral"}
      />
    </div>
  );
}
