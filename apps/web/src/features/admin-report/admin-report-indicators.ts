import type { AdminReportRows, PlatformAccountCounts } from "@sellbridge/database/repositories";
import { TICKET_CATEGORY_LABELS } from "@sellbridge/shared/schemas";
import {
  median,
  minutesBetween,
  noReopenOf,
  onTimeOf,
  ratingRate,
  type OpenedTicketRow,
} from "@sellbridge/shared/support-performance";
import { TICKET_CATEGORIES } from "@sellbridge/shared/ticket-rules";
import { baseOf, percentile } from "@/features/report-kit/report-format";
import type {
  ReportIndicatorRow,
  ReportMetricRow,
  ReportSense,
  ReportTarget,
  ReportValueFormat,
} from "@/features/report-kit/report-model";
import type { PeriodRows, WindowRows } from "./admin-report-rows";
import { ON_TIME_TARGET, RATING_TARGET } from "./admin-report-rules";

const countFormatter = new Intl.NumberFormat("pt-BR");
const P90 = 0.9;

interface MetricInput {
  label: string;
  base?: string | null;
  count?: number | null;
  countFormat?: ReportValueFormat;
  rate?: number | null;
  rateFormat?: ReportValueFormat;
  previous: number | null;
  target?: ReportTarget | null;
  sense: ReportSense;
  indent?: boolean;
}

export function metric(input: MetricInput): ReportMetricRow {
  return {
    kind: "metric",
    label: input.label,
    base: input.base ?? null,
    count: input.count ?? null,
    countFormat: input.countFormat ?? "count",
    rate: input.rate ?? null,
    rateFormat: input.rateFormat ?? "rate",
    previous: input.previous,
    target: input.target ?? null,
    sense: input.sense,
    indent: input.indent ?? false,
  };
}

/** Minutes from opening to the first public reply, of the answered tickets. */
export function firstResponseMinutesOf(rows: readonly OpenedTicketRow[]): number[] {
  return rows.flatMap((row) =>
    row.firstResponseAt === null ? [] : [minutesBetween(row.createdAt, row.firstResponseAt)],
  );
}

function createdRows(period: PeriodRows, now: Date): ReportIndicatorRow[] {
  const { current, previous } = period;
  const onTime = onTimeOf(current.opened, now);
  const byCategory = TICKET_CATEGORIES.flatMap((category) => {
    const count = current.opened.filter((row) => row.category === category).length;
    const before = previous.opened.filter((row) => row.category === category).length;
    if (count === 0 && before === 0) {
      return [];
    }
    const label = TICKET_CATEGORY_LABELS[category];
    return [metric({ label, count, previous: before, sense: "neutral", indent: true })];
  });
  return [
    {
      kind: "group",
      label: `Criados no período · ${countFormatter.format(current.opened.length)}`,
      note: null,
    },
    metric({
      label: "Criados",
      count: current.opened.length,
      previous: previous.opened.length,
      sense: "neutral",
    }),
    ...byCategory,
    metric({
      label: "Respondidos dentro do prazo",
      base: baseOf(onTime.sample, "respondidos ou com prazo vencido"),
      rate: onTime.value,
      previous: onTimeOf(previous.opened, now).value,
      target: ON_TIME_TARGET,
      sense: "higher_is_better",
    }),
  ];
}

function cameBackCount(rows: WindowRows): number {
  return rows.resolutions.filter((row) => row.cameBack).length;
}

function closedRows(period: PeriodRows, from: Date, now: Date): ReportIndicatorRow[] {
  const { current, previous } = period;
  const carried = current.resolutions.filter((row) => row.openedAt.getTime() < from.getTime());
  const noReopen = noReopenOf(current.resolutions, now);
  const total = current.resolutions.length;
  return [
    {
      kind: "group",
      label: `Encerrados no período · ${countFormatter.format(total)}`,
      note: `${countFormatter.format(carried.length)} deles abertos antes do período`,
    },
    metric({
      label: "Encerrados",
      count: total,
      previous: previous.resolutions.length,
      sense: "higher_is_better",
    }),
    metric({
      label: "Resolvidos sem reabrir",
      base: baseOf(noReopen.sample, "encerrados há mais de 7 dias"),
      rate: noReopen.value,
      previous: noReopenOf(previous.resolutions, now).value,
      sense: "higher_is_better",
    }),
    metric({
      label: "Reabertos",
      count: cameBackCount(current),
      previous: cameBackCount(previous),
      sense: "lower_is_better",
    }),
  ];
}

function serviceRows(period: PeriodRows): ReportIndicatorRow[] {
  const minutes = firstResponseMinutesOf(period.current.opened);
  const previousMinutes = firstResponseMinutesOf(period.previous.opened);
  const rating = ratingRate(period.current.ratings);
  return [
    { kind: "group", label: "Tempo e satisfação", note: null },
    metric({
      label: "Primeira resposta (mediana)",
      base: baseOf(minutes.length, "respondidos"),
      count: median(minutes),
      countFormat: "minutes",
      previous: median(previousMinutes),
      sense: "lower_is_better",
    }),
    metric({
      label: "Primeira resposta: 90% até",
      count: percentile(minutes, P90),
      countFormat: "minutes",
      previous: percentile(previousMinutes, P90),
      sense: "lower_is_better",
    }),
    metric({
      label: "Nota média",
      base: baseOf(rating.sample, "notas"),
      rate: rating.value,
      rateFormat: "rating",
      previous: ratingRate(period.previous.ratings).value,
      target: RATING_TARGET,
      sense: "higher_is_better",
    }),
  ];
}

function queueRows(rows: AdminReportRows): ReportIndicatorRow[] {
  const queue = rows.performance.queue;
  return [
    { kind: "group", label: "Fila agora", note: "No momento em que o relatório foi gerado" },
    metric({ label: "Abertos agora", count: queue.length, previous: null, sense: "neutral" }),
    metric({
      label: "Atrasados agora",
      count: queue.filter((row) => row.overdue).length,
      previous: null,
      sense: "lower_is_better",
    }),
  ];
}

function platformRows(platform: {
  current: PlatformAccountCounts;
  previous: PlatformAccountCounts;
}) {
  const { current, previous } = platform;
  const rows: ReportIndicatorRow[] = [
    { kind: "group", label: "Plataforma", note: null },
    metric({
      label: "Revendedores novos",
      count: current.newSellers,
      previous: previous.newSellers,
      sense: "higher_is_better",
    }),
    metric({
      label: "Fornecedores novos",
      count: current.newSuppliers,
      previous: previous.newSuppliers,
      sense: "higher_is_better",
    }),
    metric({
      label: "Revendedores com pedido no período",
      count: current.sellersWithOrders,
      previous: previous.sellersWithOrders,
      sense: "higher_is_better",
    }),
  ];
  return rows;
}

export function adminIndicators(input: {
  rows: AdminReportRows;
  period: PeriodRows;
  from: Date;
  now: Date;
}): ReportIndicatorRow[] {
  return [
    ...createdRows(input.period, input.now),
    ...closedRows(input.period, input.from, input.now),
    ...serviceRows(input.period),
    ...queueRows(input.rows),
    ...platformRows(input.rows.platform),
  ];
}
