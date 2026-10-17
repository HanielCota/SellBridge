import { REPORT_TIME_ZONE } from "@sellbridge/shared/period-range";

/** The subscription notice as the server sends it (dates as ISO strings). */
export type BillingNoticeView =
  { kind: "past_due"; accessUntil: string } | { kind: "payment_failed" };

export interface BillingNoticeCopy {
  title: string;
  description: string;
}

/** What the reseller reads about a payment to fix, on the dashboard and on /assinatura. */
export function billingNoticeCopy(notice: BillingNoticeView): BillingNoticeCopy {
  if (notice.kind === "payment_failed") {
    return {
      title: "Pagamento da assinatura não realizado",
      description: "Seu plano voltou ao Gratuito. Atualize o pagamento para recuperar os limites.",
    };
  }
  const lastDay = new Date(notice.accessUntil).toLocaleDateString("pt-BR", {
    timeZone: REPORT_TIME_ZONE,
  });
  return {
    title: "Pagamento da assinatura pendente",
    description: `Atualize o pagamento até ${lastDay} para manter os limites do seu plano.`,
  };
}
