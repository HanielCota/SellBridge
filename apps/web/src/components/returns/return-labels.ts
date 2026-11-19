import type { ReturnPolicyDetails } from "@sellbridge/database/repositories";
import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import type { CloseReason } from "@sellbridge/shared/return-policy";
import type { StatusTone } from "@/components/data/tone-status";
import { formatDeadline, formatDeadlineDay, formatSmartDate } from "@/lib/relative-time";

const brazilClock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: REPORT_TIME_ZONE,
});

/**
 * "até o fim de quinta" reads better than "até sexta às 00:00": a deadline at Brasília midnight
 * names the day it closes. An exact time (the marketplace's own date) keeps the time.
 */
export function deadlineText(deadline: Date, now: Date = new Date()): string {
  if (brazilClock.format(deadline) === "00:00") {
    const lastDay = new Date(deadline.getTime() - 60_000);
    return `até o fim de ${formatDeadlineDay(lastDay, now)}`;
  }
  return `até ${formatDeadline(deadline, now)}`;
}

const CLOSE_LABELS: Record<CloseReason, string> = {
  supplier_agreed: "Fornecedor confirmou",
  supplier_silent: "Fornecedor não respondeu no prazo",
  team_decided: "Equipe SellBridge decidiu",
  not_forwarded: "Pacote não reenviado em 7 dias",
};

export interface StepBadge {
  tone: StatusTone;
  label: string;
}

/** The return's situation in a few words, the same on every screen that shows it. */
export function returnStepBadge(policy: ReturnPolicyDetails, now: Date = new Date()): StepBadge {
  if (policy.step === "awaiting_supplier") {
    const due =
      policy.supplierDueAt === null ? "" : ` · ${deadlineText(policy.supplierDueAt, now)}`;
    return { tone: "warning", label: `Fornecedor conferindo${due}` };
  }
  if (policy.step === "awaiting_forward") {
    const due = policy.forwardDueAt === null ? "" : ` · ${deadlineText(policy.forwardDueAt, now)}`;
    return { tone: "warning", label: `Reenviar ao fornecedor${due}` };
  }
  if (policy.step === "forwarded") {
    return { tone: "info", label: "A caminho do fornecedor" };
  }
  if (policy.step === "disputed") {
    return { tone: "info", label: "Equipe SellBridge decidindo" };
  }
  const closedOn = policy.closedAt === null ? "" : ` · ${formatSmartDate(policy.closedAt, now)}`;
  return { tone: "success", label: `Encerrada${closedOn}` };
}

/** Why a closed return ended the way it did. */
export function closeReasonText(closeReason: CloseReason | null): string {
  return closeReason === null ? "" : CLOSE_LABELS[closeReason];
}
