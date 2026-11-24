import type { BuyerQuestionStatus } from "@sellbridge/database/schema";
import type { StatusTone } from "@/components/data/tone-status";
import { formatDeadline, formatRelativeTime } from "@/lib/relative-time";

export interface QuestionSeal {
  tone: StatusTone;
  label: string;
  /** Follows the clock ("há 5 minutos"), so the server render and the browser may differ. */
  timeBased: boolean;
}

/**
 * Mercado Livre shows buyers the seller's response time and counts answers past an hour as
 * slow ("Gerenciamento de perguntas e respostas"): green until then, yellow up to a day, red after.
 */
const NEW_FOR_MILLISECONDS = 60 * 60 * 1000;
const LATE_AFTER_MILLISECONDS = 24 * 60 * 60 * 1000;

/** How long a question has waited, in color and words. */
export function waitingSeal(askedAt: Date, now: Date): QuestionSeal {
  const waited = now.getTime() - askedAt.getTime();
  const since = formatRelativeTime(askedAt, now);
  if (waited < NEW_FOR_MILLISECONDS) {
    return { tone: "success", label: `Nova · ${since}`, timeBased: true };
  }
  if (waited < LATE_AFTER_MILLISECONDS) {
    return { tone: "warning", label: `Esperando · ${since}`, timeBased: true };
  }
  return { tone: "danger", label: `Atrasada · ${since}`, timeBased: true };
}

/** Where a question stands, with the date when it has one. */
export function questionSeal(
  question: { status: BuyerQuestionStatus; askedAt: Date; answeredAt: Date | null },
  now: Date,
): QuestionSeal {
  if (question.status === "unanswered") {
    return waitingSeal(question.askedAt, now);
  }
  if (question.status === "under_review") {
    return { tone: "info", label: "Em análise no Mercado Livre", timeBased: false };
  }
  if (question.status === "closed") {
    return { tone: "muted", label: "Anúncio encerrado sem resposta", timeBased: false };
  }
  if (question.status === "removed") {
    return { tone: "muted", label: "Apagada no Mercado Livre", timeBased: false };
  }
  if (question.answeredAt === null) {
    return { tone: "success", label: "Respondida", timeBased: false };
  }
  return {
    tone: "success",
    label: `Respondida ${formatDeadline(question.answeredAt, now)}`,
    timeBased: true,
  };
}
