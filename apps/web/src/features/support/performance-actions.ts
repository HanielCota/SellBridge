import type {
  AgentPerformance,
  HealthLevel,
  HealthMetricKey,
  SupportBucket,
  SupportHealthMetric,
  SupportPerformanceReport,
} from "@sellbridge/shared/support-performance";
import { formatPercent } from "@/lib/percent";
import {
  bucketLabel,
  bucketTitle,
  formatMinutes,
  formatRate,
  subjectFullLabel,
  subjectQueueSearch,
} from "./performance-format";
import { formatHealthValue, HEALTH_LEVEL_LABELS } from "./performance-health";

/*
 * The health card's two halves in words: what turns the level green again, most urgent first,
 * and how the level moved over the last buckets.
 */

const ACTIONS_SHOWN = 3;
const HISTORY_SHOWN = 5;
const count = new Intl.NumberFormat("pt-BR");
const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

export type HealthActionTarget =
  | { kind: "queue"; search: Record<string, string> }
  | { kind: "metric"; metric: HealthMetricKey }
  | { kind: "hours" }
  | { kind: "person"; agentId: string };

export interface HealthAction {
  key: string;
  title: string;
  detail: string;
  cta: string;
  tone: "danger" | "warning";
  target: HealthActionTarget;
}

function metricOf(report: SupportPerformanceReport, key: HealthMetricKey) {
  return report.health.metrics.find((metric) => metric.key === key);
}

function behind(metric: SupportHealthMetric | undefined): metric is SupportHealthMetric {
  return metric !== undefined && (metric.level === "warning" || metric.level === "off_target");
}

function firstName(agent: Pick<AgentPerformance, "name">): string {
  return agent.name.split(" ")[0] ?? agent.name;
}

function overdueAction(report: SupportPerformanceReport): HealthAction[] {
  const item = report.attention.find((attention) => attention.kind === "overdue");
  if (item?.kind !== "overdue") {
    return [];
  }
  const holders = report.team
    .filter((agent) => agent.overdueNow > 0)
    .toSorted((first, second) => second.overdueNow - first.overdueNow)
    .slice(0, 2)
    .map((agent) => `${agent.overdueNow} com ${firstName(agent)}`);
  return [
    {
      key: "overdue",
      title: `Responder ${item.count === 1 ? "o chamado atrasado" : `os ${count.format(item.count)} chamados atrasados`}`,
      detail: [
        `O mais antigo espera há ${formatMinutes(item.oldestAwaitingMinutes)}`,
        ...holders,
      ].join(" · "),
      cta: "Abrir na fila",
      tone: "danger",
      target: { kind: "queue", search: { queue: "overdue" } },
    },
  ];
}

/** The slowest support hour with enough tickets to mean something, in words ("seg, 17h"). */
export function slowestHourText(report: SupportPerformanceReport): string | null {
  const slowest = report.heatmap
    .filter(
      (cell) => cell.hour !== "outside" && cell.firstResponseMinutes !== null && cell.opened >= 2,
    )
    .toSorted(
      (first, second) => (second.firstResponseMinutes ?? 0) - (first.firstResponseMinutes ?? 0),
    )
    .at(0);
  if (slowest === undefined || slowest.hour === "outside") {
    return null;
  }
  return `${WEEKDAY_SHORT[slowest.weekday] ?? ""}, ${slowest.hour}h`;
}

function onTimeAction(report: SupportPerformanceReport): HealthAction[] {
  const metric = metricOf(report, "on_time");
  if (!behind(metric)) {
    return [];
  }
  const slowest = slowestHourText(report);
  const detail = `${formatHealthValue("on_time", metric.current)} no prazo (meta ${formatPercent(metric.target)})`;
  return [
    {
      key: "on_time",
      title: "Reforçar a 1ª resposta",
      detail: slowest === null ? detail : `${detail} · pior horário: ${slowest}`,
      cta: "Ver horários",
      tone: metric.level === "off_target" ? "danger" : "warning",
      target: { kind: "hours" },
    },
  ];
}

function supportActions(report: SupportPerformanceReport): HealthAction[] {
  return report.attention.flatMap((item) =>
    item.kind === "needs_support"
      ? [
          {
            key: `support-${item.agentId}`,
            title: `Dar apoio a ${item.name.split(" ")[0] ?? item.name}`,
            detail: `${formatRate(item.onTime)} no prazo · ${formatRate(item.noReopen)} sem reabrir`,
            cta: "Ver ficha",
            tone: "warning" as const,
            target: { kind: "person" as const, agentId: item.agentId },
          },
        ]
      : [],
  );
}

function risingAction(report: SupportPerformanceReport): HealthAction[] {
  const item = report.attention.find((attention) => attention.kind === "rising_subject");
  if (item?.kind !== "rising_subject") {
    return [];
  }
  return [
    {
      key: "rising",
      title: "Olhar o assunto que disparou",
      detail: `“${subjectFullLabel(item.subject)}” +${count.format(item.current - item.previous)}`,
      cta: "Abrir na fila",
      tone: "warning",
      target: { kind: "queue", search: subjectQueueSearch(item.subject) },
    },
  ];
}

function metricAction(
  report: SupportPerformanceReport,
  key: "no_reopen" | "rating",
): HealthAction[] {
  const metric = metricOf(report, key);
  if (!behind(metric)) {
    return [];
  }
  const words = {
    no_reopen: { title: "Ver os chamados que voltaram", noun: "sem reabrir" },
    rating: { title: "Ver as notas baixas", noun: "de nota" },
  }[key];
  return [
    {
      key,
      title: words.title,
      detail: `${formatHealthValue(key, metric.current)} ${words.noun} (meta ${formatHealthValue(key, metric.target)})`,
      cta: "Ver detalhe",
      tone: metric.level === "off_target" ? "danger" : "warning",
      target: { kind: "metric", metric: key },
    },
  ];
}

/** Up to three things that bring the level back, the most urgent first. */
export function healthActions(report: SupportPerformanceReport): HealthAction[] {
  return [
    ...overdueAction(report),
    ...onTimeAction(report),
    ...supportActions(report).slice(0, 1),
    ...risingAction(report),
    ...metricAction(report, "no_reopen"),
    ...metricAction(report, "rating"),
  ].slice(0, ACTIONS_SHOWN);
}

export interface HistoryStep {
  label: string;
  title: string;
  level: HealthLevel;
}

const LEVEL_RANK: Record<HealthLevel, number> = {
  off_target: 0,
  warning: 1,
  on_target: 2,
  insufficient: 3,
};

const PREVIOUS_WORDS: Record<SupportBucket, string> = {
  hour: "na hora anterior",
  day: "no dia anterior",
  week: "na semana anterior",
};

/** The level of the last buckets and one sentence on how it moved. */
export function healthHistory(report: SupportPerformanceReport): {
  steps: HistoryStep[];
  text: string;
  worse: boolean;
} {
  const steps = report.series.slice(-HISTORY_SHOWN).map((point) => ({
    label: bucketLabel(point.start, report.bucket),
    title: `${bucketTitle(point.start, report.bucket)}: ${HEALTH_LEVEL_LABELS[point.healthLevel]}`,
    level: point.healthLevel,
  }));
  const last = steps.at(-1)?.level;
  const previous = steps.at(-2)?.level;
  if (
    last === undefined ||
    previous === undefined ||
    last === "insufficient" ||
    previous === "insufficient"
  ) {
    return { steps, text: "Poucos dados para comparar com antes.", worse: false };
  }
  const when = PREVIOUS_WORDS[report.bucket];
  if (LEVEL_RANK[last] < LEVEL_RANK[previous]) {
    return {
      steps,
      text: `Piorou: estava em ${HEALTH_LEVEL_LABELS[previous]} ${when}.`,
      worse: true,
    };
  }
  if (LEVEL_RANK[last] > LEVEL_RANK[previous]) {
    return {
      steps,
      text: `Melhorou: estava em ${HEALTH_LEVEL_LABELS[previous]} ${when}.`,
      worse: false,
    };
  }
  return { steps, text: `Igual ${when.replace("na ", "à ").replace("no ", "ao ")}.`, worse: false };
}
