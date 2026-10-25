import {
  MINIMUM_RESOLVED_TO_COMPARE,
  NO_REOPEN_NEEDS_SUPPORT_GAP,
  type AgentPerformance,
  type AttentionItem,
  type SupportOrigin,
  type SupportPerformanceReport,
  type SupportPeriodDays,
} from "@sellbridge/shared/support-performance";
import { OTHER_SITUATION_ID } from "@sellbridge/shared/support-topics";
import { formatPercent } from "@/lib/percent";
import {
  ORIGIN_LABELS,
  formatMinutes,
  formatRate,
  subjectFullLabel,
  subjectQueueSearch,
  topicLabel,
} from "./performance-format";

/*
 * The plain-language parts of the performance screen: the one-line summary under the title and
 * the "Precisa de você" items. Numbers in a sentence stand out; good and bad news get a tone.
 */

export type StoryTone = "strong" | "good" | "bad";

export interface StorySegment {
  text: string;
  tone?: StoryTone;
}

const count = new Intl.NumberFormat("pt-BR");

function plural(amount: number, one: string, many: string): string {
  return `${count.format(amount)} ${amount === 1 ? one : many}`;
}

function resolvedChange(current: number, previous: number | null): StorySegment[] {
  if (previous === null || previous === 0 || current === previous) {
    return [];
  }
  const change = Math.abs(current - previous) / previous;
  const more = current > previous;
  return [
    { text: ", " },
    { text: `${formatPercent(change)} a ${more ? "mais" : "menos"}`, tone: more ? "good" : "bad" },
  ];
}

/** "128 chamados resolvidos, 9% a mais. Entraram 150: a fila cresceu 22. O que mais cresceu: …" */
export function boardStory(report: SupportPerformanceReport): StorySegment[] {
  const resolved = report.overview.resolved.current ?? 0;
  const opened = report.overview.opened.current ?? 0;
  if (resolved === 0 && opened === 0) {
    return [{ text: "Nenhum chamado no período." }];
  }
  const inflow: StorySegment[] =
    opened > resolved
      ? [
          { text: ` Entraram ${count.format(opened)}: ` },
          { text: `a fila cresceu ${count.format(opened - resolved)}`, tone: "bad" },
          { text: "." },
        ]
      : [
          { text: ` Entraram ${count.format(opened)}: ` },
          { text: "a equipe deu conta", tone: "good" },
          { text: "." },
        ];
  const rising = report.attention.find((item) => item.kind === "rising_subject");
  const risingSegments: StorySegment[] =
    rising?.kind === "rising_subject"
      ? [
          { text: " O que mais cresceu: " },
          { text: `“${subjectFullLabel(rising.subject)}”`, tone: "bad" },
          { text: "." },
        ]
      : [];
  return [
    { text: plural(resolved, "chamado resolvido", "chamados resolvidos"), tone: "strong" },
    ...resolvedChange(resolved, report.overview.resolved.previous),
    { text: "." },
    ...inflow,
    ...risingSegments,
  ];
}

/** One line about a person: what to train first, or what they do best. */
export function personStory(agent: AgentPerformance): StorySegment[] {
  if (agent.standing === "too_few") {
    return [{ text: "Poucos chamados no período para comparar com a equipe." }];
  }
  // One ticket that came back is not a training need: enough of them, and clearly below.
  const weakest = agent.subjects.find(
    (subject) =>
      subject.noReopen.sample >= MINIMUM_RESOLVED_TO_COMPARE &&
      subject.noReopen.value !== null &&
      subject.teamNoReopen.value !== null &&
      subject.noReopen.value < subject.teamNoReopen.value - NO_REOPEN_NEEDS_SUPPORT_GAP,
  );
  if (weakest !== undefined) {
    return [
      { text: "Precisa de treino em " },
      { text: `“${subjectFullLabel(weakest)}”`, tone: "bad" },
      { text: "." },
    ];
  }
  const strongest = agent.subjects.at(0);
  if (strongest === undefined) {
    return [{ text: "Nenhum chamado resolvido no período." }];
  }
  return [
    { text: "Vai bem em " },
    { text: `“${subjectFullLabel(strongest)}”`, tone: "good" },
    { text: "." },
  ];
}

export type AttentionTone = "danger" | "review" | "info";

export type AttentionLink =
  | { to: "/admin/chamados"; search: Record<string, string> }
  | { to: "/admin/chamados/metricas"; search: Record<string, string | number> };

export interface AttentionCopy {
  key: string;
  title: string;
  description: string;
  tone: AttentionTone;
  link: AttentionLink;
}

/** The report the item came from: its links keep the same period and customers. */
export interface AttentionScope {
  days: SupportPeriodDays;
  origin: SupportOrigin;
}

const QUEUE = "/admin/chamados" as const;

function queueSearch(scope: AttentionScope, search: Record<string, string>) {
  return scope.origin === "todos" ? search : { ...search, origem: scope.origin };
}

function subjectCopy(item: Extract<AttentionItem, { kind: "rising_subject" }>): AttentionCopy {
  return {
    key: "rising",
    title: `“${subjectFullLabel(item.subject)}” +${count.format(item.current - item.previous)}`,
    description: `${ORIGIN_LABELS[item.subject.origin]} · pode ser uma falha geral`,
    tone: "review",
    link: { to: QUEUE, search: subjectQueueSearch(item.subject) },
  };
}

/** The words and destination of one "Precisa de você" item. */
export function attentionCopy(item: AttentionItem, scope: AttentionScope): AttentionCopy {
  if (item.kind === "overdue") {
    return {
      key: "overdue",
      title: plural(item.count, "chamado fora do prazo", "chamados fora do prazo"),
      description: `O mais antigo espera há ${formatMinutes(item.oldestAwaitingMinutes)}`,
      tone: "danger",
      link: { to: QUEUE, search: queueSearch(scope, { queue: "overdue" }) },
    };
  }
  if (item.kind === "rising_subject") {
    return subjectCopy(item);
  }
  if (item.kind === "needs_support") {
    return {
      key: `support-${item.agentId}`,
      title: `${item.name} precisa de apoio`,
      description: `${formatRate(item.onTime)} no prazo · ${formatRate(item.noReopen)} sem reabrir`,
      tone: "review",
      link: {
        to: "/admin/chamados/metricas",
        search: { pessoa: item.agentId, days: scope.days, origem: scope.origin },
      },
    };
  }
  if (item.kind === "unassigned") {
    return {
      key: "unassigned",
      title: plural(item.count, "chamado sem responsável", "chamados sem responsável"),
      description: "Esperando alguém da equipe pegar",
      tone: "info",
      link: { to: QUEUE, search: queueSearch(scope, { queue: "unassigned" }) },
    };
  }
  return {
    key: "open-ended",
    title: `“Outro problema” em ${formatPercent(item.share)} de ${topicLabel(item.origin, item.category)}`,
    description: "Falta uma opção no formulário de suporte",
    tone: "info",
    link: {
      to: QUEUE,
      search: subjectQueueSearch({
        origin: item.origin,
        category: item.category,
        situationId: OTHER_SITUATION_ID,
      }),
    },
  };
}
