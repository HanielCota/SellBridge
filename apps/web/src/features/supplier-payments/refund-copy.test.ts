import { formatCents } from "@sellbridge/shared/money";
import { describe, expect, test } from "vitest";
import { resellerRefundText } from "./refund-copy";

const AMOUNT = formatCents(5990);

describe("resellerRefundText", () => {
  test("says why and how much is coming back while the refund is under way", () => {
    const text = resellerRefundText({
      badge: { kind: "refunding" },
      refund: { reason: "not_dispatched", failed: false },
      amountCents: 5990,
    });

    expect(text).toBe(
      `O fornecedor não postou o envio no prazo. Estamos devolvendo ${AMOUNT} para você pelo Mercado Pago.`,
    );
  });

  test("tells the reseller the team takes over when Mercado Pago refuses the refund", () => {
    const text = resellerRefundText({
      badge: { kind: "refunding" },
      refund: { reason: "cancelled", failed: true },
      amountCents: 5990,
    });

    expect(text).toBe(
      `O envio foi cancelado. O Mercado Pago não aceitou devolver ${AMOUNT}. Nossa equipe já foi avisada e vai falar com você.`,
    );
  });

  test("says the team gives the money back and how to ask, with the last day", () => {
    const text = resellerRefundText({
      badge: { kind: "refunding" },
      refund: { reason: "cancelled", failed: true },
      amountCents: 5990,
      provider: "asaas",
      manualRefund: { ticketId: null, askUntil: "2026-12-20T15:00:00.000Z" },
      now: new Date("2026-11-20T15:00:00.000Z"),
    });

    expect(text).toBe(
      `O envio foi cancelado. Quem devolve os ${AMOUNT} é a equipe do SellBridge. Peça a devolução pelo botão abaixo até 20 de dez.: depois dessa data o Asaas libera o valor ao fornecedor.`,
    );
  });

  test("points to the ticket once the reseller asked for the refund", () => {
    const text = resellerRefundText({
      badge: { kind: "refunding" },
      refund: { reason: "cancelled", failed: true },
      amountCents: 5990,
      provider: "asaas",
      manualRefund: { ticketId: "8d0c0a52-3b4f-4bb0-9a49-2f1f5d1f7c11", askUntil: null },
    });

    expect(text).toBe(
      `O envio foi cancelado. Quem devolve os ${AMOUNT} é a equipe do SellBridge. Seu pedido de devolução já está com a equipe: a resposta chega no chamado.`,
    );
  });

  test("confirms the money came back", () => {
    const text = resellerRefundText({
      badge: { kind: "refunded", refundedAt: "2026-11-15T13:00:00.000Z" },
      refund: { reason: "returned", failed: false },
      amountCents: 5990,
    });

    expect(text).toBe(
      `O envio voltou para o fornecedor. Devolvemos ${AMOUNT} para você pelo Mercado Pago.`,
    );
  });

  test("keeps the old sentence for a refund the supplier made on its own", () => {
    const text = resellerRefundText({
      badge: { kind: "refunded", refundedAt: null },
      refund: null,
      amountCents: 5990,
    });

    expect(text).toBe("O pagamento voltou para você no Mercado Pago.");
  });

  test("says nothing while the parcel is paid and stays paid", () => {
    const text = resellerRefundText({
      badge: { kind: "paid", paidAt: "2026-11-15T13:00:00.000Z", method: "pix" },
      refund: null,
      amountCents: 5990,
    });

    expect(text).toBeNull();
  });
});
