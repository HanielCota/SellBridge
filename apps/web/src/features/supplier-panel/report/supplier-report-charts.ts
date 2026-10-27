import type { SupplierReportShipment } from "@sellbridge/database/repositories";
import { monthRange, trendMonths, type ReportRange } from "@sellbridge/shared/report-period";
import {
  acceptOutcome,
  DISPATCH_ON_TIME_TARGET,
  dispatchOutcome,
  tallyDispatch,
} from "@sellbridge/shared/supplier-panel-health";
import { formatMinutes, rateOf } from "@/features/report-kit/report-format";
import type {
  ReportBarItem,
  ReportChart,
  ReportSplitRow,
} from "@/features/report-kit/report-model";
import {
  dispatchedIn,
  dispatchMinutes,
  receivedIn,
  reviewsIn,
  type SupplierReportInput,
} from "./supplier-report-input";
import type { WindowFigures } from "./supplier-report-indicators";

/** Products in the "Mais vendidos" chart; the rest are in the products spreadsheet. */
const TOP_PRODUCTS = 8;
const HOUR_MINUTES = 60;

/** Hours from receipt to dispatch: half a day, a day, two, three, and beyond. */
const DISPATCH_BANDS = [
  { label: "Até 12h", upTo: 12 * HOUR_MINUTES },
  { label: "12h a 24h", upTo: 24 * HOUR_MINUTES },
  { label: "24h a 48h", upTo: 48 * HOUR_MINUTES },
  { label: "48h a 72h", upTo: 72 * HOUR_MINUTES },
  { label: "Mais de 72h", upTo: Number.POSITIVE_INFINITY },
] as const;

/** Units per SKU in the parcels received in the range; cancelled parcels sold nothing. */
function unitsBySku(shipments: readonly SupplierReportShipment[], range: ReportRange) {
  const lines = receivedIn(shipments, range)
    .filter((shipment) => shipment.status !== "cancelled")
    .flatMap((shipment) => shipment.items);
  return lines.reduce((units, item) => {
    const known = units.get(item.sku);
    return new Map(units).set(item.sku, {
      title: known?.title ?? item.title,
      quantity: (known?.quantity ?? 0) + item.quantity,
    });
  }, new Map<string, { title: string; quantity: number }>());
}

function bestSellers(input: SupplierReportInput): ReportChart {
  const current = unitsBySku(input.shipments, input.period);
  const previous = unitsBySku(input.shipments, input.period.previous);
  const items: ReportBarItem[] = [...current.entries()]
    .toSorted(([, first], [, second]) => second.quantity - first.quantity)
    .slice(0, TOP_PRODUCTS)
    .map(([sku, units]) => ({
      label: units.title,
      current: units.quantity,
      previous: previous.get(sku)?.quantity ?? 0,
    }));
  return {
    kind: "grouped_bars",
    title: "Mais vendidos",
    note: "Unidades nos pedidos recebidos, comparadas com o período anterior. Cancelados não contam.",
    format: "count",
    items,
  };
}

/** Dispatch on time by the month the parcel left, the report's month the last one. */
function dispatchTrend(input: SupplierReportInput): ReportChart {
  const points = trendMonths(input.period).map((month) => {
    const tally = tallyDispatch(dispatchedIn(input.shipments, monthRange(month)), input.now);
    return { month, value: rateOf(tally.good, tally.counted) };
  });
  return {
    kind: "trend",
    title: "Despacho no prazo mês a mês",
    note: "Pelo mês em que o pedido foi despachado. A linha tracejada é a meta.",
    format: "rate",
    target: { value: DISPATCH_ON_TIME_TARGET, kind: "min" },
    points,
  };
}

function dispatchTimes(input: SupplierReportInput, current: WindowFigures): ReportChart {
  const minutes = dispatchMinutes(dispatchedIn(input.shipments, input.period));
  const buckets = DISPATCH_BANDS.map((band, index) => {
    const from = index === 0 ? 0 : (DISPATCH_BANDS[index - 1]?.upTo ?? 0);
    const count = minutes.filter((value) => value >= from && value < band.upTo).length;
    return { label: band.label, count };
  });
  return {
    kind: "histogram",
    title: "Tempo até despachar",
    note: "Do recebimento do pedido até o despacho.",
    buckets,
    median: current.medianMinutes === null ? null : formatMinutes(current.medianMinutes),
    percentile90:
      current.percentile90Minutes === null ? null : formatMinutes(current.percentile90Minutes),
  };
}

function onTimeSplit(input: SupplierReportInput): ReportChart {
  const received = receivedIn(input.shipments, input.period);
  const dispatched = dispatchedIn(input.shipments, input.period);
  const accept = received.map((shipment) => acceptOutcome(shipment, input.now));
  const dispatch = dispatched.map((shipment) => dispatchOutcome(shipment, input.now));
  const rows: ReportSplitRow[] = [
    {
      label: "Aceite",
      yesLabel: "No prazo",
      yes: accept.filter((outcome) => outcome === "on_time").length,
      noLabel: "Atrasado",
      no: accept.filter((outcome) => outcome === "late").length,
    },
    {
      label: "Despacho",
      yesLabel: "No prazo",
      yes: dispatch.filter((outcome) => outcome === "on_time").length,
      noLabel: "Atrasado",
      no: dispatch.filter((outcome) => outcome === "late").length,
    },
  ];
  return {
    kind: "split",
    title: "No prazo e atrasados",
    note: "Pedidos ainda dentro do prazo não entram na conta.",
    rows,
  };
}

function ratingRing(input: SupplierReportInput, current: WindowFigures): ReportChart {
  const reviews = reviewsIn(input.reviews, input.period);
  const counts = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((review) => review.rating === stars).length,
  }));
  return {
    kind: "rating",
    title: "Avaliações dos revendedores",
    note: "Cada nota conta no mês em que foi dada.",
    average: current.ratings.average,
    counts,
  };
}

export function supplierCharts(input: SupplierReportInput, current: WindowFigures): ReportChart[] {
  return [
    bestSellers(input),
    dispatchTrend(input),
    dispatchTimes(input, current),
    onTimeSplit(input),
    ratingRing(input, current),
  ];
}
