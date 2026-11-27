import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";
import { ENTRY_BILLING_PLAN, FREE_SALE_LIMIT } from "@sellbridge/shared/billing";
import { formatCents } from "@sellbridge/shared/money";

/** The subscription notice as the server sends it (dates as ISO strings). */
export type BillingNoticeView =
  | { kind: "past_due"; accessUntil: string }
  | { kind: "payment_failed" }
  | { kind: "transition"; until: string; endingSoon: boolean }
  | { kind: "courtesy_ending"; until: string }
  | { kind: "free_sales_exhausted" }
  | { kind: "no_plan" };

export interface BillingNoticeCopy {
  title: string;
  description: string;
  /** A deadline still days away informs; a payment or a plan missing now asks for action. */
  tone: "danger" | "info";
}

export function lastDayOf(isoDate: string): string {
  // The access ends at a moment; the reseller still has the whole day before it.
  const end = new Date(isoDate);
  if (Number.isNaN(end.getTime())) {
    throw new RangeError(`Access end is not a date: ${isoDate}`);
  }
  const lastMoment = new Date(end.getTime() - 1);
  return lastMoment.toLocaleDateString("pt-BR", { timeZone: REPORT_TIME_ZONE });
}

/** What the reseller reads about the subscription, on the dashboard and on /assinatura. */
export function billingNoticeCopy(notice: BillingNoticeView): BillingNoticeCopy {
  if (notice.kind === "payment_failed") {
    return {
      title: "A mensalidade não foi paga",
      description:
        "Seus anúncios e envios em andamento continuam. Pague a mensalidade em aberto para operar novas vendas.",
      tone: "danger",
    };
  }
  if (notice.kind === "no_plan") {
    return {
      title: "Escolha seu plano",
      description: "Com um plano você opera novas vendas, conecta lojas e publica anúncios.",
      tone: "info",
    };
  }

  if (notice.kind === "free_sales_exhausted") {
    return {
      title: `Você usou as ${FREE_SALE_LIMIT} vendas gratuitas`,
      description: `Para continuar com novas vendas, assine o ${ENTRY_BILLING_PLAN.name} por ${formatCents(ENTRY_BILLING_PLAN.priceCents)} por mês ou escolha outro plano.`,
      tone: "info",
    };
  }

  if (notice.kind === "transition") {
    return {
      title: `Escolha seu plano até ${lastDayOf(notice.until)}`,
      description:
        "Até lá tudo continua como está. Depois, para conectar lojas e publicar, é preciso um plano.",
      tone: notice.endingSoon ? "danger" : "info",
    };
  }
  if (notice.kind === "courtesy_ending") {
    return {
      title: `Seu plano por cortesia vale até ${lastDayOf(notice.until)}`,
      description:
        "Depois, para conectar lojas e publicar, escolha um plano. O que está no ar continua.",
      tone: "info",
    };
  }
  const lastDay = new Date(notice.accessUntil).toLocaleDateString("pt-BR", {
    timeZone: REPORT_TIME_ZONE,
  });
  return {
    title: "Mensalidade em aberto",
    description: `Pague a mensalidade até ${lastDay} para manter o seu plano.`,
    tone: "danger",
  };
}
