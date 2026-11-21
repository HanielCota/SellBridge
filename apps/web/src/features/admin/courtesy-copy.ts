import type { BillingPlan, BillingPlanId } from "@sellbridge/shared/billing";
import { lastDayOf } from "@/features/billing/billing-notice";

/** What the team fills in to give or change a courtesy plan. */
export interface CourtesyForm {
  plan: BillingPlanId;
  hasEnd: boolean;
  /** The last day the plan is valid (YYYY-MM-DD), used while `hasEnd`. */
  lastDay: string;
  reason: string;
}

const MIN_REASON_LENGTH = 5;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "Elite · 40 lojas · 20.000 anúncios": the limits the account gets, next to the name. */
export function planOptionLabel(plan: BillingPlan): string {
  const listings = new Intl.NumberFormat("pt-BR").format(plan.listings);
  return `${plan.name} · ${plan.stores} lojas · ${listings} anúncios`;
}

/** One year ahead of `today` (YYYY-MM-DD): the end the form opens with. */
export function defaultCourtesyLastDay(today: string): string {
  const [year = "", month = "", day = ""] = today.split("-");
  const nextYear = Number(year) + 1;
  if (!Number.isInteger(nextYear)) {
    throw new RangeError(`Today is not a calendar date: ${today}`);
  }
  // 29/02 has no anniversary next year; the 28th is the last day that exists.
  const safeDay = month === "02" && day === "29" ? "28" : day;
  return `${nextYear}-${month}-${safeDay}`;
}

/** "até 28/02/2027" or "sem data para acabar", from the moment the plan ends. */
export function courtesyEndText(expiresAt: string | null): string {
  return expiresAt === null ? "Sem data para acabar" : `Até ${lastDayOf(expiresAt)}`;
}

/** The first thing wrong with the form and how to fix it, or null when it can be sent. */
export function courtesyFormError(
  form: CourtesyForm,
  today: string,
): { field: "lastDay" | "reason"; message: string } | null {
  if (form.hasEnd && !ISO_DAY.test(form.lastDay)) {
    return { field: "lastDay", message: "Escolha o último dia da cortesia." };
  }
  if (form.hasEnd && form.lastDay < today) {
    return { field: "lastDay", message: "Escolha uma data de hoje em diante." };
  }
  if (form.reason.trim().length < MIN_REASON_LENGTH) {
    return { field: "reason", message: "Escreva o motivo, com pelo menos 5 letras." };
  }
  return null;
}
