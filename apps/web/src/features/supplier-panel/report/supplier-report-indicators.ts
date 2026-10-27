import type { SupplierReportShipment } from "@sellbridge/database/repositories";
import type { ReportRange } from "@sellbridge/shared/report-period";
import {
  ACCEPT_ON_TIME_TARGET,
  DISPATCH_ON_TIME_TARGET,
  MIN_HEALTH_ORDERS,
  RATING_TARGET,
  SUPPLIER_CANCELLATION_TARGET,
  tallyAccept,
  tallyCancellations,
  tallyDispatch,
  tallyRatings,
} from "@sellbridge/shared/supplier-panel-health";
import { MIN_REVIEWS_FOR_SCORE } from "@sellbridge/shared/supplier-score";
import { baseOf, percentile, rateOf } from "@/features/report-kit/report-format";
import type {
  ReportIndicatorRow,
  ReportMetricRow,
  ReportTarget,
} from "@/features/report-kit/report-model";
import {
  dispatchedIn,
  dispatchMinutes,
  receivedIn,
  reviewsIn,
  type SupplierReportInput,
} from "./supplier-report-input";

const countFormatter = new Intl.NumberFormat("pt-BR");
const MEDIAN = 0.5;
const PERCENTILE_90 = 0.9;

/**
 * Below the minimum a rate says more about luck (two late parcels out of five read as 60%): the
 * base says "poucos dados" and the target is not judged, as on the Desempenho page.
 */
function sampled(
  base: string,
  counted: number,
  target: ReportTarget,
  minimum: number = MIN_HEALTH_ORDERS,
): Pick<ReportMetricRow, "base" | "target"> {
  if (counted >= minimum) {
    return { base, target };
  }
  return { base: `${base} · poucos dados`, target: null };
}

type MetricFields = Pick<ReportMetricRow, "label"> & Partial<ReportMetricRow>;

function metric(fields: MetricFields): ReportMetricRow {
  return {
    kind: "metric",
    base: null,
    count: null,
    countFormat: "count",
    rate: null,
    rateFormat: "rate",
    previous: null,
    target: null,
    sense: "neutral",
    indent: true,
    ...fields,
  };
}

/** Every number of one window, so the current and the previous one are counted alike. */
export function windowFigures(input: SupplierReportInput, range: ReportRange) {
  const received = receivedIn(input.shipments, range);
  const dispatched = dispatchedIn(input.shipments, range);
  const accept = tallyAccept(received, input.now);
  const cancellations = tallyCancellations(received);
  const dispatch = tallyDispatch(dispatched, input.now);
  const ratings = tallyRatings(reviewsIn(input.reviews, range));
  const minutes = dispatchMinutes(dispatched);
  return {
    received,
    dispatched,
    accept: { ...accept, rate: rateOf(accept.good, accept.counted) },
    cancellations: {
      cancelled: cancellations.counted - cancellations.good,
      settled: cancellations.counted,
      rate: rateOf(cancellations.counted - cancellations.good, cancellations.counted),
    },
    dispatch: { ...dispatch, rate: rateOf(dispatch.good, dispatch.counted) },
    ratings: {
      count: ratings.count,
      average: ratings.count === 0 ? null : ratings.sum / ratings.count,
    },
    medianMinutes: percentile(minutes, MEDIAN),
    percentile90Minutes: percentile(minutes, PERCENTILE_90),
  };
}
export type WindowFigures = ReturnType<typeof windowFigures>;

function receivedRows(current: WindowFigures, previous: WindowFigures): ReportIndicatorRow[] {
  return [
    {
      kind: "group",
      label: `Recebidos no período · ${countFormatter.format(current.received.length)}`,
      note: null,
    },
    metric({
      label: "Pedidos recebidos",
      count: current.received.length,
      previous: previous.received.length,
    }),
    metric({
      label: "Aceitos no prazo",
      ...sampled(baseOf(current.accept.counted, "aceites contados"), current.accept.counted, {
        value: ACCEPT_ON_TIME_TARGET,
        kind: "min",
      }),
      count: current.accept.good,
      rate: current.accept.rate,
      previous: previous.accept.rate,
      sense: "higher_is_better",
    }),
    metric({
      label: "Cancelados por você",
      ...sampled(
        baseOf(current.cancellations.settled, "concluídos"),
        current.cancellations.settled,
        { value: SUPPLIER_CANCELLATION_TARGET, kind: "max" },
      ),
      count: current.cancellations.cancelled,
      rate: current.cancellations.rate,
      previous: previous.cancellations.rate,
      sense: "lower_is_better",
    }),
  ];
}

/** "3 deles recebidos no período anterior": why the two group totals do not add up. */
function receivedBefore(
  dispatched: readonly SupplierReportShipment[],
  range: ReportRange,
): string | null {
  const before = dispatched.filter(
    (shipment) => shipment.receivedAt.getTime() < range.from.getTime(),
  );
  if (before.length === 0) {
    return null;
  }
  const verb = before.length === 1 ? "recebido" : "recebidos";
  const pronoun = before.length === 1 ? "dele" : "deles";
  return `${countFormatter.format(before.length)} ${pronoun} ${verb} no período anterior`;
}

function dispatchedRows(
  current: WindowFigures,
  previous: WindowFigures,
  range: ReportRange,
): ReportIndicatorRow[] {
  const total = current.dispatched.length;
  return [
    {
      kind: "group",
      label: `Despachados no período · ${countFormatter.format(total)}`,
      note: receivedBefore(current.dispatched, range),
    },
    metric({
      label: "Despachados no prazo",
      ...sampled(baseOf(current.dispatch.counted, "despachados"), current.dispatch.counted, {
        value: DISPATCH_ON_TIME_TARGET,
        kind: "min",
      }),
      count: current.dispatch.good,
      rate: current.dispatch.rate,
      previous: previous.dispatch.rate,
      sense: "higher_is_better",
    }),
    metric({
      label: "Tempo até despachar: metade dos pedidos",
      count: current.medianMinutes,
      countFormat: "minutes",
      previous: previous.medianMinutes,
      sense: "lower_is_better",
    }),
    metric({
      label: "Tempo até despachar: 9 de cada 10",
      count: current.percentile90Minutes,
      countFormat: "minutes",
      previous: previous.percentile90Minutes,
      sense: "lower_is_better",
    }),
  ];
}

function ratingRows(current: WindowFigures, previous: WindowFigures): ReportIndicatorRow[] {
  const base = baseOf(
    current.ratings.count,
    current.ratings.count === 1 ? "avaliação" : "avaliações",
  );
  return [
    {
      kind: "group",
      label: `Avaliações · ${countFormatter.format(current.ratings.count)}`,
      note: null,
    },
    metric({
      label: "Nota média",
      ...sampled(
        base,
        current.ratings.count,
        { value: RATING_TARGET, kind: "min" },
        MIN_REVIEWS_FOR_SCORE,
      ),
      rate: current.ratings.average,
      rateFormat: "rating",
      previous: previous.ratings.average,
      sense: "higher_is_better",
    }),
  ];
}

function catalogRows(input: SupplierReportInput): ReportIndicatorRow[] {
  const { catalog } = input;
  return [
    { kind: "group", label: "Produtos", note: "situação de quando o relatório foi gerado" },
    metric({
      label: "Esgotados ainda anunciados",
      base: baseOf(catalog.approved, "produtos à venda"),
      count: catalog.outOfStockListed.length,
      sense: "lower_is_better",
    }),
    metric({
      label: "Recusados na revisão",
      base: baseOf(catalog.products, "produtos"),
      count: catalog.rejected.length,
      sense: "lower_is_better",
    }),
  ];
}

export function supplierIndicators(
  input: SupplierReportInput,
  current: WindowFigures,
  previous: WindowFigures,
): ReportIndicatorRow[] {
  return [
    ...receivedRows(current, previous),
    ...dispatchedRows(current, previous, input.period),
    ...ratingRows(current, previous),
    ...catalogRows(input),
  ];
}
