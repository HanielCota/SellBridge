import type {
  HealthDrillDetail,
  HealthLevel,
  HealthMetricKey,
  SeriesPoint,
  SupportHealthMetric,
} from "@sellbridge/shared/support-performance";
import { MINIMUM_RESOLVED_TO_COMPARE } from "@sellbridge/shared/support-performance";
import type { StatusTone } from "@/components/data/tone-status";
import { formatPercent } from "@/lib/percent";
import {
  changeCopy,
  EMPTY_FIGURE,
  formatMinutes,
  formatRating,
  type ChangeCopy,
} from "./performance-format";

/*
 * The words of the support health block (thermometer, metrics against targets, the tickets
 * behind each one), adapted from the supplier's Desempenho so both read the same way.
 */

export const HEALTH_LEVEL_LABELS: Record<HealthLevel, string> = {
  on_target: "Dentro da meta",
  warning: "Atenção",
  off_target: "Fora da meta",
  insufficient: "Poucos dados",
};

export const HEALTH_LEVEL_TONES: Record<HealthLevel, StatusTone> = {
  on_target: "success",
  warning: "warning",
  off_target: "danger",
  insufficient: "muted",
};

export const HEALTH_SUMMARIES: Record<HealthLevel, string> = {
  on_target: "Todas as métricas dentro da meta.",
  warning: "Uma ou mais métricas pedem atenção.",
  off_target: "Corrija primeiro o que está em vermelho.",
  insufficient: "Com poucos chamados, nada conta contra a equipe.",
};

export const HEALTH_METRIC_LABELS: Record<HealthMetricKey, string> = {
  on_time: "1ª resposta no prazo",
  overdue_now: "Fora do prazo agora",
  no_reopen: "Resolvidos sem reabrir",
  rating: "Nota dos clientes",
};

export const HEALTH_METRIC_HINTS: Record<HealthMetricKey, string> = {
  on_time: "Primeira resposta dentro do prazo da prioridade",
  overdue_now: "Chamados esperando resposta além do prazo neste momento",
  no_reopen: "Encerrados há mais de 7 dias que o cliente não reabriu nem trouxe de volta",
  rating: "Média das notas que os clientes deram ao atendimento",
};

export const DRILL_DOWN_CAPTIONS: Record<HealthMetricKey, string> = {
  on_time: "Chamados respondidos depois do prazo, ou ainda sem resposta.",
  overdue_now: "Chamados esperando resposta além do prazo agora.",
  no_reopen: "Chamados que o cliente reabriu ou trouxe de volta em até 7 dias.",
  rating: "Avaliações de 1 a 3 estrelas.",
};

export const DRILL_DOWN_EMPTY: Record<HealthMetricKey, string> = {
  on_time: "Nenhuma primeira resposta fora do prazo no período.",
  overdue_now: "Nenhum chamado atrasado agora.",
  no_reopen: "Nenhum chamado voltou no período.",
  rating: "Nenhuma nota de 1 a 3 no período.",
};

const count = new Intl.NumberFormat("pt-BR");

export function formatHealthValue(key: HealthMetricKey, value: number | null): string {
  if (value === null) {
    return EMPTY_FIGURE;
  }
  if (key === "overdue_now") {
    return count.format(value);
  }
  return key === "rating" ? formatRating(value) : formatPercent(value);
}

/** The line beside each value: "meta: 90% ou mais", "meta: até 2". */
export function formatHealthTarget(metric: Pick<SupportHealthMetric, "key" | "target">): string {
  if (metric.key === "overdue_now") {
    return `meta: até ${count.format(metric.target)}`;
  }
  return `meta: ${formatHealthValue(metric.key, metric.target)} ou mais`;
}

function plural(amount: number, one: string, many: string): string {
  return `${count.format(amount)} ${amount === 1 ? one : many}`;
}

const BACK_TO_TARGET: Record<Exclude<HealthMetricKey, "overdue_now">, [string, string]> = {
  on_time: ["resposta no prazo", "respostas no prazo"],
  no_reopen: ["resolvido sem voltar", "resolvidos sem voltar"],
  rating: ["nota 5", "notas 5"],
};

function onTargetText(metric: SupportHealthMetric): string {
  if (metric.key === "overdue_now") {
    return metric.current === 0 ? "Nenhum chamado atrasado agora." : "Dentro da meta.";
  }
  const nouns: Record<Exclude<HealthMetricKey, "overdue_now">, [string, string]> = {
    on_time: ["primeira resposta conta", "primeiras respostas contam"],
    no_reopen: ["encerrado conta", "encerrados contam"],
    rating: ["avaliação conta", "avaliações contam"],
  };
  const [one, many] = nouns[metric.key];
  return `${plural(metric.sample, one, many)} neste período.`;
}

/** What it takes to get back to the target, or how much the figure stands on. */
export function healthForecast(metric: SupportHealthMetric): string {
  if (metric.level === "insufficient") {
    return `Poucos dados: ${count.format(metric.sample)} de ${MINIMUM_RESOLVED_TO_COMPARE} para medir.`;
  }
  if (metric.toTarget === null) {
    return onTargetText(metric);
  }
  if (metric.key === "overdue_now") {
    return `Responder ${count.format(metric.toTarget)} deles já volta para a meta.`;
  }
  const [one, many] = BACK_TO_TARGET[metric.key];
  return `Com mais ${plural(metric.toTarget, one, many)}, volta para a meta.`;
}

/** How the metric moved against the previous period; the queue right now has no history. */
export function healthChange(metric: SupportHealthMetric): ChangeCopy | null {
  if (metric.key === "overdue_now" || metric.level === "insufficient") {
    return null;
  }
  return changeCopy({
    current: metric.current,
    previous: metric.previous,
    kind: metric.key === "rating" ? "rating" : "rate",
  });
}

/** The right-hand figure of a ticket behind a metric. */
export function drillDetailText(detail: HealthDrillDetail): string {
  if (detail.kind === "answered_late") {
    return `respondeu em ${formatMinutes(detail.responseMinutes)}`;
  }
  if (detail.kind === "unanswered") {
    return "sem resposta";
  }
  if (detail.kind === "waiting") {
    return `espera há ${formatMinutes(detail.minutes)}`;
  }
  if (detail.kind === "came_back") {
    return "voltou";
  }
  return `${detail.rating} ${detail.rating === 1 ? "estrela" : "estrelas"}`;
}

/** The metric per bucket; the queue has no past, so it shows the tickets that went late. */
export function healthSeriesValue(point: SeriesPoint, key: HealthMetricKey): number | null {
  if (key === "on_time") {
    return point.onTimeRate;
  }
  if (key === "overdue_now") {
    return point.lateFirstResponses;
  }
  return key === "no_reopen" ? point.noReopenRate : point.rating;
}

export const HEALTH_SERIES_LABELS: Record<HealthMetricKey, string> = {
  on_time: "No prazo",
  overdue_now: "Passaram do prazo",
  no_reopen: "Sem reabrir",
  rating: "Nota",
};

/** The words under a target card: where it stands, without numbers or jargon. */
export function healthStatusWords(metric: Pick<SupportHealthMetric, "key" | "level">): string {
  if (metric.level === "insufficient") {
    return "Poucos dados";
  }
  if (metric.level === "on_target") {
    return "Bateu a meta";
  }
  return metric.key === "overdue_now" ? "Passou do limite" : "Abaixo da meta";
}

/** "meta 90%" or, for the late queue, "limite 2". */
export function healthTargetShort(metric: Pick<SupportHealthMetric, "key" | "target">): string {
  if (metric.key === "overdue_now") {
    return `limite ${count.format(metric.target)}`;
  }
  return `meta ${formatHealthValue(metric.key, metric.target)}`;
}

/**
 * Where the bar ends and where the target mark sits, as shares of the bar (0–1). Shares and
 * stars have a natural ceiling; the late queue's grows with the count so the mark stays inside.
 */
export function healthBar(metric: Pick<SupportHealthMetric, "key" | "current" | "target">): {
  fill: number;
  mark: number;
} {
  const value = metric.current ?? 0;
  if (metric.key === "overdue_now") {
    const ceiling = Math.max(metric.target * 2.5, value * 1.25, 1);
    return { fill: Math.min(1, value / ceiling), mark: metric.target / ceiling };
  }
  const ceiling = metric.key === "rating" ? 5 : 1;
  return { fill: Math.min(1, value / ceiling), mark: metric.target / ceiling };
}

/** Whether a bucket of the metric met the target (the late queue counts down). */
export function bucketMetTarget(key: HealthMetricKey, value: number, target: number): boolean {
  return key === "overdue_now" ? value <= target : value >= target;
}
