import { describe, expect, test } from "vitest";
import {
  mustReceiveProtected,
  receivingProviderFor,
  reviewStatusFromAsaas,
  type ReceivingSituation,
} from "./payment-accounts.ts";

const RULE_OFF = { enabled: false, deliveries: 5 };
const RULE_ON = { enabled: true, deliveries: 5 };

function situation(overrides: Partial<ReceivingSituation> = {}): ReceivingSituation {
  return {
    mercadoPagoUsable: true,
    asaasUsable: true,
    choice: null,
    rule: RULE_OFF,
    confirmedDeliveries: 0,
    ...overrides,
  };
}

describe("reviewStatusFromAsaas", () => {
  test.each([
    ["APPROVED", "approved"],
    ["AWAITING_APPROVAL", "awaiting_approval"],
    ["REJECTED", "rejected"],
    ["PENDING", "pending"],
    ["SOMETHING_NEW", "pending"],
  ] as const)("keeps %s as %s", (general, expected) => {
    expect(reviewStatusFromAsaas(general)).toBe(expected);
  });
});

describe("mustReceiveProtected", () => {
  test("never applies while the rule is off", () => {
    expect(mustReceiveProtected(RULE_OFF, 0)).toBe(false);
  });

  test("applies below the number of deliveries", () => {
    expect(mustReceiveProtected(RULE_ON, 4)).toBe(true);
  });

  test("stops applying at the number of deliveries", () => {
    expect(mustReceiveProtected(RULE_ON, 5)).toBe(false);
  });
});

describe("receivingProviderFor", () => {
  test("uses Mercado Pago when the supplier never chose and both are usable", () => {
    expect(receivingProviderFor(situation())).toEqual({
      provider: "mercado_pago",
      heldByRule: false,
    });
  });

  test("uses the supplier's choice of Asaas", () => {
    expect(receivingProviderFor(situation({ choice: "asaas" }))).toEqual({
      provider: "asaas",
      heldByRule: false,
    });
  });

  test("falls back to the other account when the chosen one is not usable", () => {
    const provider = receivingProviderFor(situation({ choice: "asaas", asaasUsable: false }));

    expect(provider).toEqual({ provider: "mercado_pago", heldByRule: false });
  });

  test("uses Asaas when it is the only usable account", () => {
    const provider = receivingProviderFor(situation({ mercadoPagoUsable: false }));

    expect(provider).toEqual({ provider: "asaas", heldByRule: false });
  });

  test("refuses when no account is usable", () => {
    const provider = receivingProviderFor(
      situation({ mercadoPagoUsable: false, asaasUsable: false }),
    );

    expect(provider).toEqual({ provider: null, reason: "no_account" });
  });

  test("holds a new supplier to Asaas over its choice of Mercado Pago", () => {
    const provider = receivingProviderFor(
      situation({ rule: RULE_ON, confirmedDeliveries: 2, choice: "mercado_pago" }),
    );

    expect(provider).toEqual({ provider: "asaas", heldByRule: true });
  });

  test("refuses a new supplier without an approved Asaas account while the rule applies", () => {
    const provider = receivingProviderFor(
      situation({ rule: RULE_ON, confirmedDeliveries: 2, asaasUsable: false }),
    );

    expect(provider).toEqual({ provider: null, reason: "protection_required" });
  });

  test("lets a supplier with enough deliveries use Mercado Pago again", () => {
    const provider = receivingProviderFor(
      situation({ rule: RULE_ON, confirmedDeliveries: 5, choice: "mercado_pago" }),
    );

    expect(provider).toEqual({ provider: "mercado_pago", heldByRule: false });
  });
});
