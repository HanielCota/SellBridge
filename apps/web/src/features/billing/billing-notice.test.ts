import { describe, expect, it } from "vitest";
import { billingNoticeCopy } from "./billing-notice";

describe("billingNoticeCopy", () => {
  it("names the last day of the grace in Brasília time", () => {
    // 02:00 UTC on the 24th is still the 23rd in São Paulo.
    const copy = billingNoticeCopy({ kind: "past_due", accessUntil: "2026-10-24T02:00:00.000Z" });
    expect(copy).toEqual({
      title: "Pagamento da assinatura pendente",
      description: "Pague a mensalidade até 23/10/2026 para manter o seu plano.",
      tone: "danger",
    });
  });

  it("keeps orders and listings running once the grace is over, with no free plan", () => {
    expect(billingNoticeCopy({ kind: "payment_failed" })).toEqual({
      title: "Pagamento da assinatura não realizado",
      description:
        "Seus pedidos e anúncios continuam. Para conectar lojas e publicar, pague a mensalidade em aberto.",
      tone: "danger",
    });
  });

  it("asks an account without a plan to choose one", () => {
    expect(billingNoticeCopy({ kind: "no_plan" })).toMatchObject({
      title: "Escolha seu plano",
      tone: "info",
    });
  });

  it("names the last whole day of the transition", () => {
    // Ends at midnight in São Paulo on 31/12: the 30th is the last day with access.
    const copy = billingNoticeCopy({
      kind: "transition",
      until: "2026-12-31T03:00:00.000Z",
      endingSoon: false,
    });
    expect(copy).toEqual({
      title: "Escolha seu plano até 30/12/2026",
      description:
        "Até lá tudo continua como está. Depois, para conectar lojas e publicar, é preciso um plano.",
      tone: "info",
    });
  });

  it("warns in the last days of the transition", () => {
    const copy = billingNoticeCopy({
      kind: "transition",
      until: "2026-12-31T03:00:00.000Z",
      endingSoon: true,
    });
    expect(copy.tone).toBe("danger");
  });
});
