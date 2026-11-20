import { describe, expect, it } from "vitest";
import { cancelCopy, cancelledMessage, paidDaysSentence } from "./billing-copy";

describe("billing copy", () => {
  it("says the plan lasts until the last paid day when nothing is given back", () => {
    expect(cancelCopy({ endsAt: "2026-12-20T03:00:00.000Z", refundCents: null })).toContain(
      "Seu plano vale até 19/12/2026 e não renova.",
    );
  });

  it("says the first fee comes back in full and the plan ends now", () => {
    const copy = cancelCopy({ endsAt: null, refundCents: 19_700 });

    expect(copy).toContain("devolvemos R$ 197,00 inteiro pelo Asaas");
    expect(copy).toContain("O plano acaba agora.");
  });

  it("confirms the refund after cancelling", () => {
    expect(cancelledMessage({ endsAt: null, refundCents: 9_700 })).toBe(
      "Assinatura cancelada. Devolvemos R$ 97,00 pelo Asaas.",
    );
  });

  it("counts the paid days the deletion gives up", () => {
    expect(paidDaysSentence(12, "Pro")).toBe(
      "Você ainda tem 12 dias pagos do plano Pro. Se excluir a conta agora, perde esses dias.",
    );
  });

  it("speaks of a single paid day in the singular", () => {
    expect(paidDaysSentence(1, "Start")).toBe(
      "Você ainda tem 1 dia pago do plano Start. Se excluir a conta agora, perde esse dia.",
    );
  });
});
