import type { ProfileKind } from "@sellbridge/shared/profile-kind";
import { NO_SITUATION_FILTER, TICKET_CATEGORY_LABELS } from "@sellbridge/shared/schemas";
import type {
  AgentPerformance,
  AgentStanding,
  Rate,
  SubjectKey,
  SupportBucket,
  SupportPeriod,
} from "@sellbridge/shared/support-performance";
import {
  findSupportSituation,
  findSupportTopic,
  OTHER_SITUATION_ID,
} from "@sellbridge/shared/support-topics";
import type { TicketCategory } from "@sellbridge/shared/ticket-rules";
import { formatPercent } from "@/lib/percent";
import { formatDuration } from "./response-time";

/*
 * Words and numbers of the support performance screen, kept out of the components so the
 * copy is tested and every card says the same thing the same way.
 */

export const ORIGIN_LABELS: Record<ProfileKind, string> = {
  seller: "Revendedores",
  supplier: "Fornecedores",
};

const oneDecimal = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const EMPTY_FIGURE = "—";

const wholeNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** The topic as the customer saw it on the form ("Pedido ou entrega"). */
export function topicLabel(origin: ProfileKind, category: TicketCategory): string {
  return findSupportTopic(origin, category)?.label ?? TICKET_CATEGORY_LABELS[category];
}

/**
 * What the customer picked: the situation's label, "Outro problema", or "Sem detalhe" for tickets
 * opened before the guided form recorded it.
 */
export function subjectLabel(subject: SubjectKey): string {
  const topic = findSupportTopic(subject.origin, subject.category);
  if (topic === undefined) {
    return TICKET_CATEGORY_LABELS[subject.category];
  }
  if (subject.situationId === null) {
    return topic.situations.length === 0 ? topic.label : "Sem detalhe";
  }
  return findSupportSituation(topic, subject.situationId)?.label ?? "Situação antiga";
}

/**
 * The subject outside its topic's group: "Outro problema" and "Sem detalhe" say nothing alone,
 * so they carry the topic ("Meus anúncios · outro problema").
 */
export function subjectFullLabel(subject: SubjectKey): string {
  const label = subjectLabel(subject);
  const vague = subject.situationId === null || subject.situationId === OTHER_SITUATION_ID;
  const topic = topicLabel(subject.origin, subject.category);
  if (!vague || label === topic) {
    return label;
  }
  return `${topic} · ${label.toLowerCase()}`;
}

const QUEUE_ORIGIN: Record<ProfileKind, "revendedor" | "fornecedor"> = {
  seller: "revendedor",
  supplier: "fornecedor",
};

/**
 * The team queue narrowed to one subject: its topic, its situation (or `sem-detalhe`) and its
 * kind of customer, since the same situation id exists for resellers and suppliers.
 */
export function subjectQueueSearch(subject: SubjectKey): Record<string, string> {
  return {
    category: subject.category,
    situacao: subject.situationId ?? NO_SITUATION_FILTER,
    origem: QUEUE_ORIGIN[subject.origin],
  };
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) {
    return EMPTY_FIGURE;
  }
  return formatDuration(minutes * 60_000);
}

export function formatRate(rate: Rate): string {
  return rate.value === null ? EMPTY_FIGURE : formatPercent(rate.value);
}

/** "82% de 17", for the tooltip that keeps small samples honest. */
export function rateSampleText(rate: Rate, noun: string): string {
  if (rate.value === null) {
    return `Nenhum ${noun} no período`;
  }
  return `${formatPercent(rate.value)} de ${rate.sample} ${noun}`;
}

export function formatRating(value: number | null): string {
  return value === null ? EMPTY_FIGURE : oneDecimal.format(value);
}

export type StandingTone = "danger" | "warning" | "good" | "muted";

export interface StandingCopy {
  text: string;
  tone: StandingTone;
}

const STANDING_COPY: Record<Exclude<AgentStanding, "overdue">, StandingCopy> = {
  too_few: { text: "Poucos chamados", tone: "muted" },
  needs_support: { text: "Precisa de apoio", tone: "warning" },
  above_team: { text: "Acima da equipe", tone: "good" },
  on_par: { text: "Na média", tone: "muted" },
};

export function standingCopy(
  agent: Pick<AgentPerformance, "standing" | "overdueNow">,
): StandingCopy {
  if (agent.standing === "overdue") {
    return { text: `${agent.overdueNow} fora do prazo`, tone: "danger" };
  }
  return STANDING_COPY[agent.standing];
}

export const STANDING_TONE_CLASSES: Record<StandingTone, string> = {
  danger: "text-destructive",
  warning: "text-amber-700 dark:text-amber-300",
  good: "text-brand-text",
  muted: "text-muted-foreground font-normal",
};

const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});
const weekdayShort = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

/** The hour of an hourly bucket ("2026-10-25T09" → 9). */
function bucketHour(start: string): number {
  return Number(start.slice(11, 13));
}

/** A bucket's label on the axis: "9h" for hours, "seg" for days, "22/09" for weeks. */
export function bucketLabel(start: string, bucket: SupportBucket): string {
  if (bucket === "hour") {
    return `${bucketHour(start)}h`;
  }
  return shortDate.format(new Date(`${start.slice(0, 10)}T12:00:00Z`));
}

/** A bucket in a tooltip: "9h às 10h", "seg, 20/10" or "Semana de 20/10". */
export function bucketTitle(start: string, bucket: SupportBucket): string {
  if (bucket === "hour") {
    return `${bucketHour(start)}h às ${bucketHour(start) + 1}h`;
  }
  const date = new Date(`${start.slice(0, 10)}T12:00:00Z`);
  const day = shortDate.format(date);
  return bucket === "day"
    ? `${weekdayShort.format(date).replace(".", "")}, ${day}`
    : `Semana de ${day}`;
}

/** "hoje", "em 30 dias" or "no período escolhido", after a figure's name. */
export function periodWhen(period: SupportPeriod): string {
  if (period.preset === "today") {
    return "hoje";
  }
  return period.preset === "custom" ? "no período escolhido" : `em ${period.days} dias`;
}

/** "a semana anterior", "o dia anterior" or "a hora anterior". */
export function previousBucketText(bucket: SupportBucket): string {
  const words: Record<SupportBucket, string> = {
    hour: "a hora anterior",
    day: "o dia anterior",
    week: "a semana anterior",
  };
  return words[bucket];
}

const longDate = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  timeZone: "America/Sao_Paulo",
});

/** "25 de setembro a 24 de outubro". */
export function periodCaption(period: SupportPeriod): string {
  // Noon UTC stays on the same calendar day in Brasília.
  const from = longDate.format(new Date(`${period.fromDate}T12:00:00Z`));
  if (period.days === 1) {
    return period.preset === "today" ? `Hoje, ${from}` : from;
  }
  return `${from} a ${longDate.format(new Date(`${period.toDate}T12:00:00Z`))}`;
}

/** "entrou em 02/10 · em experiência" or "desde mar/2026". */
export function tenureText(agent: Pick<AgentPerformance, "joinedAt" | "onProbation">): string {
  const joined = new Date(agent.joinedAt);
  if (agent.onProbation) {
    const day = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(joined);
    return `entrou em ${day} · em experiência`;
  }
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  })
    .format(joined)
    .replace(". de ", "/")
    .replace(" de ", "/");
  return `desde ${month}`;
}

export type ChangeKind = "count" | "minutes" | "rate" | "rating";

export interface ChangeCopy {
  direction: "up" | "down" | "flat";
  label: string;
  /** Whether the move is good news: a shorter first response is, though it goes down. */
  good: boolean | null;
}

/** Moves this small read as "igual": half a percentage point, a twentieth of a star. */
const CHANGE_TOLERANCE: Record<ChangeKind, number> = {
  count: 0,
  minutes: 0,
  rate: 0.005,
  rating: 0.05,
};

function changeLabel(kind: ChangeKind, current: number, previous: number): string {
  const difference = Math.abs(current - previous);
  if (kind === "count") {
    return previous === 0 ? wholeNumber.format(difference) : formatPercent(difference / previous);
  }
  if (kind === "minutes") {
    return formatDuration(difference * 60_000);
  }
  if (kind === "rate") {
    return `${Math.round(difference * 100)} p.p.`;
  }
  return oneDecimal.format(difference);
}

/** How a figure moved, in the badge's words; null when there is nothing to compare with. */
export function changeCopy(input: {
  current: number | null;
  previous: number | null;
  kind: ChangeKind;
  lowerIsBetter?: boolean;
}): ChangeCopy | null {
  const { current, previous, kind } = input;
  if (current === null || previous === null) {
    return null;
  }
  if (Math.abs(current - previous) <= CHANGE_TOLERANCE[kind]) {
    return { direction: "flat", label: "igual", good: null };
  }
  const up = current > previous;
  return {
    direction: up ? "up" : "down",
    label: changeLabel(kind, current, previous),
    good: input.lowerIsBetter === true ? !up : up,
  };
}

/** The period as URL search params, so links keep the period the coordinator is looking at. */
export function periodSearch(period: SupportPeriod): {
  period: SupportPeriod["preset"];
  from?: string;
  to?: string;
} {
  if (period.preset !== "custom") {
    return { period: period.preset };
  }
  return { period: "custom", from: period.fromDate, to: period.toDate };
}
