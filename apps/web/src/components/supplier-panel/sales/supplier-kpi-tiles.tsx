import type { SupplierSalesPoint, SupplierSalesSummary } from "@sellbridge/database/repositories";
import type { ReactNode } from "react";
import { TERM_HINTS } from "@/components/icons/action-icons";
import {
  CompareSparkline,
  countValue,
  MONEY_VALUE,
  type KpiValueFormat,
} from "@/components/reports/compare-sparkline";
import { MoneyFigure, TrendTag } from "@/components/reports/figures";
import type { SupplierSalesSituation } from "@sellbridge/shared/supplier-panel-sales";
import { StatTile, type StatTileProps } from "@/components/reports/stat-tile";
import { buildKpiStory, type KpiMeasure } from "@/features/reports/kpi-story";
import { trendTagParts, type TrendTagParts } from "@/features/reports/trend-tone";
import {
  supplierAmountLabels,
  supplierTrendPolarity,
} from "@/features/supplier-panel/sales/amount-labels";

const count = new Intl.NumberFormat("pt-BR");

const VERSUS = "vs. anterior";

interface SupplierKpiSeries {
  points: readonly SupplierSalesPoint[];
  previousPoints: readonly SupplierSalesPoint[] | null;
  bucket: "hour" | "day" | "week";
  /** How many days the previous period starts before this one. */
  offsetDays: number;
}

interface SupplierKpiTilesProps extends SupplierKpiSeries {
  summary: SupplierSalesSummary;
  previous: SupplierSalesSummary;
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

const ORDERS_VALUE = countValue({ one: "pedido", many: "pedidos" });
const UNITS_VALUE = countValue({ one: "peça", many: "peças" });

const RECEIVABLE: KpiMeasure<SupplierSalesPoint> = { amount: (point) => point.receivableCents };
const ORDERS: KpiMeasure<SupplierSalesPoint> = { amount: (point) => point.orders };
const UNITS: KpiMeasure<SupplierSalesPoint> = { amount: (point) => point.units };
const AVERAGE_ORDER: KpiMeasure<SupplierSalesPoint> = {
  amount: (point) => point.receivableCents,
  per: (point) => point.orders,
};

function tileChart(
  series: SupplierKpiSeries,
  measure: KpiMeasure<SupplierSalesPoint>,
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

function AverageFigure({ cents }: { cents: number | null }) {
  if (cents === null) {
    return <span className="font-semibold">—</span>;
  }
  return <MoneyFigure cents={cents} />;
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
  situation,
  className = "grid gap-4 sm:grid-cols-2 xl:grid-cols-1",
  ...series
}: SupplierKpiTilesProps) {
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
        chart={tileChart(series, RECEIVABLE, amount, MONEY_VALUE)}
      />
      <KpiTile
        label="Pedidos"
        hint="Ver os pedidos dos revendedores"
        figure={<Count value={summary.orders} />}
        change={<TrendTag parts={orders} suffix={VERSUS} />}
        chart={tileChart(series, ORDERS, orders, ORDERS_VALUE)}
      />
      <KpiTile
        label={labels.units}
        hint="Unidades dos seus produtos nos pedidos do período"
        figure={<Count value={summary.units} />}
        change={<TrendTag parts={units} suffix={VERSUS} />}
        chart={tileChart(series, UNITS, units, UNITS_VALUE)}
      />
      <KpiTile
        label="Valor médio por pedido"
        hint={`${TERM_HINTS.supplierAverageOrder}; veja os pedidos`}
        isTerm
        figure={<AverageFigure cents={summary.averageOrderCents} />}
        change={<TrendTag parts={average} suffix={VERSUS} />}
        chart={tileChart(series, AVERAGE_ORDER, average, MONEY_VALUE)}
      />
    </div>
  );
}
