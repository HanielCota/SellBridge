import { describe, expect, it } from "vitest";
import { moneyResolveConfirmation, moneyResolveHint, moneyStateOf } from "./money-resolve";

describe("moneyResolveConfirmation", () => {
  it("asks whether the money came back while Asaas has not confirmed the refund", () => {
    const confirmation = moneyResolveConfirmation({
      kind: "manual_refund",
      amountCents: 8000,
      refunded: false,
    });

    expect(confirmation?.title).toBe("O dinheiro já voltou ao revendedor?");
    expect(confirmation?.description).toMatch(/R\$\s80,00/);
  });

  it("resolves a refund Asaas already confirmed without asking", () => {
    const confirmation = moneyResolveConfirmation({
      kind: "manual_refund",
      amountCents: 8000,
      refunded: true,
    });

    expect(confirmation).toBeNull();
  });

  it("asks before resolving a held payment nobody decided", () => {
    const confirmation = moneyResolveConfirmation({
      kind: "held_payment",
      amountCents: 12_990,
      decidable: true,
    });

    expect(confirmation?.confirmLabel).toBe("Marcar como resolvido sem decidir");
  });

  it("resolves a held payment already decided without asking", () => {
    const confirmation = moneyResolveConfirmation({
      kind: "held_payment",
      amountCents: 12_990,
      decidable: false,
    });

    expect(confirmation).toBeNull();
  });
});

describe("moneyResolveHint", () => {
  it("says to wait for Asaas while the refund is pending", () => {
    const hint = moneyResolveHint({ kind: "manual_refund", amountCents: 8000, refunded: false });

    expect(hint).toContain("depois que o Asaas confirmar");
  });

  it("has nothing to add once the refund came back", () => {
    const hint = moneyResolveHint({ kind: "manual_refund", amountCents: 8000, refunded: true });

    expect(hint).toBeNull();
  });
});

describe("moneyStateOf", () => {
  it("keeps the problem resolvable when the refund cannot be read", () => {
    const state = moneyStateOf({
      manualRefund: { data: undefined, isError: true },
      heldPayment: null,
    });

    expect(state).toBe("unreadable");
  });

  it("keeps the problem resolvable when the held payment cannot be read", () => {
    const state = moneyStateOf({
      manualRefund: null,
      heldPayment: { data: undefined, isError: true },
    });

    expect(state).toBe("unreadable");
  });

  it("waits while the money is still being read", () => {
    const state = moneyStateOf({
      manualRefund: { data: undefined, isError: false },
      heldPayment: null,
    });

    expect(state).toBeNull();
  });

  it("reads where a refund stands", () => {
    const state = moneyStateOf({
      manualRefund: { data: { amountCents: 8000, refunded: false }, isError: false },
      heldPayment: null,
    });

    expect(state).toEqual({ kind: "manual_refund", amountCents: 8000, refunded: false });
  });
});
