import { monthRange, trendMonths, type ReportPeriod } from "@sellbridge/shared/report-period";
import { TICKET_CATEGORY_LABELS } from "@sellbridge/shared/schemas";
import { SUPPORT_HOURS } from "@sellbridge/shared/support-hours";
import {
  brazilWeekdayHour,
  isSupportHour,
  median,
  noReopenOf,
  onTimeOf,
  ratingRate,
  type OpenedTicketRow,
  type SupportPerformanceRows,
} from "@sellbridge/shared/support-performance";
import { MAX_RATING, MIN_RATING, TICKET_CATEGORIES } from "@sellbridge/shared/ticket-rules";
import { formatMinutes, percentile } from "@/features/report-kit/report-format";
import type { ReportBucket, ReportChart } from "@/features/report-kit/report-model";
import { firstResponseMinutesOf } from "./admin-report-indicators";
import { rowsWithin, type PeriodRows } from "./admin-report-rows";
import { ON_TIME_TARGET } from "./admin-report-rules";

const P90 = 0.9;
const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
/** Two-hour bands inside support hours, then everything outside them. */
const HOUR_BAND_SIZE = 2;
const OUTSIDE_LABEL = "Fora do horário";

/** Upper bounds (exclusive, in minutes) of the first-response histogram. */
const RESPONSE_BUCKETS: readonly { label: string; below: number }[] = [
  { label: "até 1h", below: 60 },
  { label: "1–4h", below: 4 * 60 },
  { label: "4–8h", below: 8 * 60 },
  { label: "8–24h", below: 24 * 60 },
  { label: "1–2d", below: 48 * 60 },
  { label: "+2d", below: Number.POSITIVE_INFINITY },
];

function byCategoryChart(period: PeriodRows): ReportChart {
  const items = TICKET_CATEGORIES.map((category) => ({
    label: TICKET_CATEGORY_LABELS[category],
    current: period.current.opened.filter((row) => row.category === category).length,
    previous: period.previous.opened.filter((row) => row.category === category).length,
  })).filter((item) => item.current > 0 || item.previous > 0);
  return {
    kind: "grouped_bars",
    title: "Por assunto",
    note: "Chamados criados no período e no período anterior.",
    format: "count",
    items,
  };
}

function onTimeTrendChart(
  rows: SupportPerformanceRows,
  period: ReportPeriod,
  now: Date,
): ReportChart {
  const points = trendMonths(period).map((month) => {
    const range = monthRange(month);
    const window = { from: range.from, to: new Date(Math.min(range.to.getTime(), now.getTime())) };
    return { month, value: onTimeOf(rowsWithin(rows, window).opened, now).value };
  });
  return {
    kind: "trend",
    title: "Dentro do prazo mês a mês",
    note: "Primeiras respostas no prazo, pelo mês em que o chamado foi aberto.",
    format: "rate",
    target: ON_TIME_TARGET,
    points,
  };
}

function responseHistogram(opened: readonly OpenedTicketRow[]): ReportChart {
  const minutes = firstResponseMinutesOf(opened);
  const buckets: ReportBucket[] = RESPONSE_BUCKETS.map((bucket, index) => {
    const floor = RESPONSE_BUCKETS[index - 1]?.below ?? 0;
    return {
      label: bucket.label,
      count: minutes.filter((value) => value >= floor && value < bucket.below).length,
    };
  });
  const middle = median(minutes);
  const high = percentile(minutes, P90);
  return {
    kind: "histogram",
    title: "Tempo da primeira resposta",
    note: "Chamados criados no período que já tiveram resposta.",
    buckets,
    median: middle === null ? null : formatMinutes(middle),
    percentile90: high === null ? null : formatMinutes(high),
  };
}

/** How many of the rate's sample passed. */
function shareOf(rate: { value: number | null; sample: number }): number {
  return Math.round((rate.value ?? 0) * rate.sample);
}

function splitChart(period: PeriodRows, now: Date): ReportChart {
  const noReopen = noReopenOf(period.current.resolutions, now);
  const onTime = onTimeOf(period.current.opened, now);
  return {
    kind: "split",
    title: "Resolvido de primeira",
    note: null,
    rows: [
      {
        label: "Resolvidos sem reabrir",
        yesLabel: "Não voltaram",
        yes: shareOf(noReopen),
        noLabel: "Voltaram",
        no: noReopen.sample - shareOf(noReopen),
      },
      {
        label: "Respondidos no prazo",
        yesLabel: "No prazo",
        yes: shareOf(onTime),
        noLabel: "Fora do prazo",
        no: onTime.sample - shareOf(onTime),
      },
    ],
  };
}

function ratingChart(period: PeriodRows): ReportChart {
  const ratings = period.current.ratings;
  const counts = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, index) => {
    const stars = MAX_RATING - index;
    return { stars, count: ratings.filter((row) => row.rating === stars).length };
  });
  return {
    kind: "rating",
    title: "Notas dos clientes",
    note: "Notas dadas no período.",
    average: ratingRate(ratings).value,
    counts,
  };
}

function hourBands(): { label: string; from: number }[] {
  const { opensAtHour, closesAtHour } = SUPPORT_HOURS;
  const count = Math.ceil((closesAtHour - opensAtHour) / HOUR_BAND_SIZE);
  return Array.from({ length: count }, (_, index) => {
    const from = opensAtHour + index * HOUR_BAND_SIZE;
    return { label: `${from}–${Math.min(closesAtHour, from + HOUR_BAND_SIZE)}h`, from };
  });
}

function arrivalHeatmap(opened: readonly OpenedTicketRow[]): ReportChart {
  const bands = hourBands();
  const cells = WEEKDAY_LABELS.map(() => Array.from({ length: bands.length + 1 }, () => 0));
  for (const row of opened) {
    const { weekday, hour } = brazilWeekdayHour(row.createdAt);
    const band = bands.findLastIndex((candidate) => hour >= candidate.from);
    const column = isSupportHour(hour) && band >= 0 ? band : bands.length;
    const line = cells[weekday];
    if (line !== undefined) {
      line[column] = (line[column] ?? 0) + 1;
    }
  }
  return {
    kind: "heatmap",
    heatmap: {
      title: "Quando chega",
      rowLabels: WEEKDAY_LABELS,
      columnLabels: [...bands.map((band) => band.label), OUTSIDE_LABEL],
      cells,
      unit: "chamados",
    },
    note: "Chamados criados por dia da semana e hora, no horário de Brasília.",
  };
}

export function adminCharts(input: {
  rows: SupportPerformanceRows;
  period: PeriodRows;
  reportPeriod: ReportPeriod;
  now: Date;
}): ReportChart[] {
  const { period, now } = input;
  return [
    byCategoryChart(period),
    onTimeTrendChart(input.rows, input.reportPeriod, now),
    responseHistogram(period.current.opened),
    splitChart(period, now),
    ratingChart(period),
    arrivalHeatmap(period.current.opened),
  ];
}
