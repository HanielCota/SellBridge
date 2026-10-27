import {
  ON_TIME_NEEDS_SUPPORT_BELOW,
  type AgentPerformance,
} from "@sellbridge/shared/support-performance";
import { formatPercent } from "@/lib/percent";
import { formatSmartDate } from "@/lib/relative-time";
import { formatMinutes, formatRate } from "./performance-format";

/*
 * The overview's people and subjects in plain words: why a person got their word, what is with
 * them right now, and how a subject moved against the previous period.
 */

const count = new Intl.NumberFormat("pt-BR");

/** A subject "disparou" with at least this many more tickets… */
const RISING_MIN_INCREASE = 3;
/** …and this growth over the previous period (the "Precisa de você" rule). */
const RISING_MIN_GROWTH = 0.5;

export interface SubjectTrend {
  text: string;
  tone: "up" | "down" | "flat";
  rising: boolean;
}

/** "↑ 40% · era 15": the change and the base it came from, so nobody does the math. */
export function subjectTrend(opened: { current: number; previous: number }): SubjectTrend {
  const { current, previous } = opened;
  const difference = current - previous;
  const rising = difference >= RISING_MIN_INCREASE && current >= previous * (1 + RISING_MIN_GROWTH);
  if (difference === 0) {
    return { text: `estável · era ${count.format(previous)}`, tone: "flat", rising };
  }
  const amount =
    previous === 0
      ? count.format(Math.abs(difference))
      : formatPercent(Math.abs(difference) / previous);
  return {
    text: `${difference > 0 ? "↑" : "↓"} ${amount} · era ${count.format(previous)}`,
    tone: difference > 0 ? "up" : "down",
    rising,
  };
}

function expectedText(agent: Pick<AgentPerformance, "expectedNoReopen">): string {
  return agent.expectedNoReopen === null
    ? ""
    : ` (esperado ${formatPercent(agent.expectedNoReopen)})`;
}

/** Why the person got their word, with the numbers that justify it. */
export function standingReason(agent: AgentPerformance): string {
  if (agent.standing === "overdue") {
    return `Mais antigo esperando há ${formatMinutes(agent.oldestAwaitingMinutes)} · ${formatRate(agent.onTime)} no prazo`;
  }
  if (agent.standing === "too_few") {
    const resolved = agent.resolved.current ?? 0;
    return `Só ${count.format(resolved)} ${resolved === 1 ? "resolvido" : "resolvidos"}: pouco para comparar`;
  }
  const noReopen = `${formatRate(agent.noReopen)} sem reabrir${expectedText(agent)}`;
  const onTime = agent.onTime.value;
  if (
    agent.standing === "needs_support" &&
    onTime !== null &&
    onTime < ON_TIME_NEEDS_SUPPORT_BELOW
  ) {
    return `${formatRate(agent.onTime)} no prazo (mínimo ${formatPercent(ON_TIME_NEEDS_SUPPORT_BELOW)}) · ${formatRate(agent.noReopen)} sem reabrir`;
  }
  if (agent.standing === "needs_support") {
    return noReopen;
  }
  return `${formatRate(agent.onTime)} no prazo · ${noReopen}`;
}

/** What is with the person right now and when they last answered. */
export function nowLine(agent: Pick<AgentPerformance, "openNow" | "lastReplyAt">): string {
  const open = `${count.format(agent.openNow)} ${agent.openNow === 1 ? "chamado" : "chamados"} com a pessoa`;
  if (agent.lastReplyAt === null) {
    return `${open} · sem respostas no período`;
  }
  return `${open} · respondeu ${formatSmartDate(new Date(agent.lastReplyAt))}`;
}
