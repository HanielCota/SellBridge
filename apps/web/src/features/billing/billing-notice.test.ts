import { describe, expect, it } from "vitest";
import { billingNoticeCopy } from "./billing-notice";

describe("billingNoticeCopy", () => {
  it("names the last day of the grace in Brasília time", () => {
    // 02:00 UTC on the 24th is still the 23rd in São Paulo.
    const copy = billingNoticeCopy({ kind: "past_due", accessUntil: "2026-10-24T02:00:00.000Z" });
    expect(copy).toEqual({
      title: "Pagamento da assinatura pendente",
      description: "Atualize o pagamento até 23/10/2026 para manter os limites do seu plano.",
    });
  });

  it("says the paid limits are gone once the grace is over", () => {
    expect(billingNoticeCopy({ kind: "payment_failed" })).toEqual({
      title: "Pagamento da assinatura não realizado",
      description: "Seu plano voltou ao Gratuito. Atualize o pagamento para recuperar os limites.",
    });
  });
});
