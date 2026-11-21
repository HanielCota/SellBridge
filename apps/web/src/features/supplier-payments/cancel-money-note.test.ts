import { formatCents } from "@sellbridge/shared/money";
import { describe, expect, test } from "vitest";
import { cancelMoneyNote } from "./cancel-money-note";

const AMOUNT = formatCents(8990);
const paid = { kind: "paid", paidAt: "2026-11-21T12:00:00.000Z", method: "PIX" } as const;

describe("cancelMoneyNote", () => {
  test("says a Pix comes back through Asaas and the team steps in if it does not", () => {
    const note = cancelMoneyNote({
      badge: paid,
      amountCents: 8990,
      paymentMethod: "PIX",
      parcelStatus: "forwarded",
    });

    expect(note).toBe(
      `Os ${AMOUNT} pagos ao fornecedor voltam para você por Pix, pelo Asaas. Se o Asaas não devolver sozinho, a equipe do SellBridge devolve, e o pedido mostra o botão para pedir.`,
    );
  });

  test("says a card payment goes back to the card and when the bill shows it", () => {
    const note = cancelMoneyNote({
      badge: paid,
      amountCents: 8990,
      paymentMethod: "CREDIT_CARD",
      parcelStatus: "forwarded",
    });

    expect(note).toContain("voltam para o seu cartão");
    expect(note).toContain("10 dias úteis");
  });

  test("says the team checks first once the supplier accepted", () => {
    const note = cancelMoneyNote({
      badge: paid,
      amountCents: 8990,
      paymentMethod: "CREDIT_CARD",
      parcelStatus: "picking",
    });

    expect(note).toContain("a equipe do SellBridge confere com ele");
  });

  test("says nothing about money while the parcel is not paid", () => {
    const note = cancelMoneyNote({
      badge: { kind: "waiting" },
      amountCents: 8990,
      paymentMethod: null,
      parcelStatus: "forwarded",
    });

    expect(note).toBeNull();
  });
});
