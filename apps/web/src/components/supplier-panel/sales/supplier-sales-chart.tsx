import { useState, type ComponentProps, type ReactNode } from "react";
import { FiltersWithTools, HeadlineWithTools } from "@/components/reports/cash-flow-chart";
import { DASHED_KEY, SOLID_KEY } from "@/components/reports/chart-frame";
import {
  ChartKindMenu,
  type ChartLayers,
  type KindHints,
} from "@/components/reports/chart-kind-menu";
import { ExportLink } from "@/components/reports/export-link";
import { MoneyFigure, TrendBadge } from "@/components/reports/figures";
import type { SupplierSalesSituation } from "@sellbridge/shared/supplier-panel-sales";
import { buildChartPoints } from "@/features/reports/chart-view";
import { supplierAmountLabels } from "@/features/supplier-panel/sales/amount-labels";
import { createChartKindStore } from "@/features/reports/chart-kind-store";
import type { SupplierSalesData } from "@/features/supplier-panel/sales/sales.queries";
import {
  buildProductRows,
  SUPPLIER_CHART_KINDS,
  toMetricPoints,
  type SupplierChartKind,
  type SupplierSeries,
} from "@/features/supplier-panel/sales/supplier-chart-data";
import { cn } from "@/lib/utils";
import { PRODUCT_LINE_STYLES, ProductPlot, TimelinePlot } from "./supplier-chart-plots";

const useSupplierChartKind = createChartKindStore<SupplierChartKind>({
  storageKey: "sellbridge-supplier-chart",
  eventName: "sellbridge-supplier-chart-change",
  kinds: SUPPLIER_CHART_KINDS,
  factory: "area",
});

const KIND_HINTS: KindHints = {
  area: "Valor a receber ou peças ao longo do tempo",
  cumulative: "Total somado desde o início do período",
  products: "Os 5 mais vendidos, cada um na sua linha",
};

const KIND_TITLES: Record<SupplierChartKind, string> = {
  area: "Vendas ao longo do período",
  cumulative: "Vendas acumuladas no período",
  products: "Vendas dos mais vendidos",
};

const count = new Intl.NumberFormat("pt-BR");

/** The reseller chart's pills, with the supplier's two series (one at a time). */
function SeriesPills({
  value,
  amountLabel,
  onChange,
}: {
  value: SupplierSeries;
  /** "A receber", or "Ficou de fora" for cancelled and returned orders. */
  amountLabel: string;
  onChange: (series: SupplierSeries) => void;
}) {
  const options: readonly { key: SupplierSeries; label: string }[] = [
    { key: "receivable", label: amountLabel },
    { key: "units", label: "Peças" },
  ];
  return (
    <fieldset className="flex flex-wrap gap-1 sm:gap-1.5">
      <legend className="sr-only">Série do gráfico</legend>
      {options.map((series) => (
        <label
          key={series.key}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground has-checked:border-foreground has-checked:bg-foreground has-checked:font-medium has-checked:text-background has-focus-visible:ring-3 has-focus-visible:ring-ring/40 sm:px-4"
        >
          <input
            type="radio"
            name="supplier-series"
            value={series.key}
            checked={series.key === value}
            onChange={() => onChange(series.key)}
            className="sr-only"
          />
          {series.label}
        </label>
      ))}
    </fieldset>
  );
}

type HeadlineTotals = Pick<SupplierSalesData["summary"], "units" | "receivableCents">;

/** The series' total and how it moved, named after the orders the situation filter keeps. */
export function SupplierChartHeadline({
  summary,
  previous: previousTotals,
  series,
  situation,
}: {
  summary: HeadlineTotals;
  previous: HeadlineTotals;
  series: SupplierSeries;
  situation: SupplierSalesSituation;
}) {
  const isUnits = series === "units";
  const labels = supplierAmountLabels(situation);
  const current = isUnits ? summary.units : summary.receivableCents;
  const previous = isUnits ? previousTotals.units : previousTotals.receivableCents;
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">
        {isUnits ? labels.unitsInPeriod : labels.amountInPeriod}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {isUnits ? (
          <span className="text-3xl font-semibold tracking-tight">{count.format(current)}</span>
        ) : (
          <MoneyFigure cents={current} className="text-3xl" />
        )}
        <TrendBadge current={current} previous={previous} suffix="vs. período anterior" />
      </div>
    </div>
  );
}

function LegendItem({ mark, children }: { mark: ReactNode; children: string }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5">
      {mark}
      <span className="truncate" title={children}>
        {children}
      </span>
    </li>
  );
}

/** What each line means: the layers on the timeline, or which product each line is. */
function Legend({
  kind,
  layers,
  products,
}: {
  kind: SupplierChartKind;
  layers: ChartLayers;
  products: SupplierSalesData["topProducts"];
}) {
  const items =
    kind === "products"
      ? products.map((product, index) => {
          const style = PRODUCT_LINE_STYLES[index] ?? PRODUCT_LINE_STYLES[1];
          const mark = (
            <svg aria-hidden="true" viewBox="0 0 20 4" className="h-1 w-5 shrink-0">
              <line
                x1={1}
                y1={2}
                x2={19}
                y2={2}
                stroke={style.color}
                strokeOpacity={style.opacity}
                strokeWidth={style.width}
                strokeDasharray={style.dash}
                strokeLinecap="round"
              />
            </svg>
          );
          return { key: product.productId, mark, text: product.title };
        })
      : [
          ...(layers.average
            ? [{ key: "average", mark: SOLID_KEY, text: "Linha cheia: média de 7 dias" }]
            : []),
          ...(layers.compare
            ? [{ key: "compare", mark: DASHED_KEY, text: "Tracejado: período anterior" }]
            : []),
        ];
  if (items.length === 0) {
    return null;
  }
  return (
    <ul
      className={cn(
        "mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground",
        kind === "products" ? "justify-start" : "justify-end",
      )}
    >
      {items.map((item) => (
        <LegendItem key={item.key} mark={item.mark}>
          {item.text}
        </LegendItem>
      ))}
    </ul>
  );
}

function ChartBody({
  data,
  kind,
  series,
  layers,
  situation,
}: {
  data: SupplierSalesData;
  kind: SupplierChartKind;
  series: SupplierSeries;
  layers: ChartLayers;
  situation: SupplierSalesSituation;
}) {
  const valueLabel = series === "units" ? "Peças" : supplierAmountLabels(situation).amount;
  const grain = data.period.bucket;
  if (kind === "products") {
    const rows = buildProductRows(
      data.timeseries.map((point) => point.date),
      data.topProducts.map((product) => product.productId),
      data.productSeries,
      series,
    );
    return <ProductPlot rows={rows} products={data.topProducts} series={series} grain={grain} />;
  }
  const cumulative = kind === "cumulative";
  const points = buildChartPoints(toMetricPoints(data.timeseries, series), {
    previous: {
      points: toMetricPoints(data.previousTimeseries, series),
      offsetDays: data.period.days,
    },
    cumulative,
  });
  return <TimelinePlot {...{ points, series, grain, layers, cumulative, valueLabel }} />;
}

/** Kind and layers on screen, and the gear menu that changes them (the reseller's, three kinds). */
function useSupplierChartMenu(canAverage: boolean, boundary: HTMLElement | null) {
  const [pickedLayers, setLayers] = useState<ChartLayers>({ compare: false, average: false });
  const { defaultKind, setDefaultKind } = useSupplierChartKind();
  const [pickedKind, setPickedKind] = useState<SupplierChartKind | null>(null);
  const kind = pickedKind ?? defaultKind;
  // A layer whose switch is hidden (this chart, these buckets) stays off on screen.
  const layers: ChartLayers = {
    average: pickedLayers.average && canAverage && kind === "area",
    compare: pickedLayers.compare && kind !== "products",
  };
  const menu: ComponentProps<typeof ChartKindMenu<SupplierChartKind>> = {
    kind,
    defaultKind,
    onKindChange: setPickedKind,
    onSetDefault: setDefaultKind,
    kinds: SUPPLIER_CHART_KINDS,
    factoryKind: "area",
    hints: KIND_HINTS,
    layers,
    onLayersChange: setLayers,
    canAverage,
    canCompare: true,
    boundary,
  };
  return { kind, layers, menu };
}

/**
 * The reseller dashboard's chart card with the supplier's sales (item 38): the filters and tools
 * on top, the headline beside the series, then the chart. Same rows, same wrap rules.
 */
export function SupplierSalesChart({
  data,
  filters,
  exportUrl,
  situation,
}: {
  data: SupplierSalesData;
  filters: ReactNode;
  exportUrl: string;
  situation: SupplierSalesSituation;
}) {
  const [series, setSeries] = useState<SupplierSeries>("receivable");
  const [card, setCard] = useState<HTMLElement | null>(null);
  const { kind, layers, menu } = useSupplierChartMenu(data.period.bucket === "day", card);
  const labels = supplierAmountLabels(situation);
  const tools = (
    <div className="flex shrink-0 gap-1.5 sm:gap-2">
      <ChartKindMenu {...menu} />
      <ExportLink href={exportUrl} />
    </div>
  );
  return (
    <section
      ref={setCard}
      aria-labelledby="supplier-chart-title"
      className="surface-card flex h-full flex-col rounded-3xl bg-card p-5"
    >
      <h2 id="supplier-chart-title" className="sr-only">
        {KIND_TITLES[kind]}
      </h2>
      <FiltersWithTools filters={filters} tools={tools} />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <HeadlineWithTools
          headline={
            <SupplierChartHeadline
              summary={data.summary}
              previous={data.previous}
              series={series}
              situation={situation}
            />
          }
          tools={tools}
        />
        <SeriesPills value={series} amountLabel={labels.amount} onChange={setSeries} />
      </div>
      <Legend kind={kind} layers={layers} products={data.topProducts} />
      {/* Grows to the height of the tiles beside it; nothing drawn may leave it. */}
      <figure
        aria-label={`Gráfico: ${KIND_TITLES[kind].toLowerCase()}`}
        className="relative mt-5 min-h-72 flex-1 overflow-hidden"
      >
        <ChartBody {...{ data, kind, series, layers, situation }} />
      </figure>
    </section>
  );
}
