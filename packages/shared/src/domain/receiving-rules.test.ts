import { describe, expect, test } from "vitest";
import {
  ASAAS_OFF_MESSAGE,
  nextReceivingRules,
  PAYMENT_NEEDS_ACCOUNT_MESSAGE,
  preparationHoldFrom,
  RECEIVING_RULES_OFF,
  receivingRulesRefusal,
} from "./receiving-rules.ts";

const NOW = new Date("2026-11-19T12:00:00Z");
const EARLIER = new Date("2026-11-10T09:00:00Z");

describe("receivingRulesRefusal", () => {
  test("refuses paying first without the receiving-account rule", () => {
    const refusal = receivingRulesRefusal(
      { requireReceivingAccount: false, paymentBeforePreparing: true },
      true,
    );

    expect(refusal).toBe(PAYMENT_NEEDS_ACCOUNT_MESSAGE);
  });

  test("refuses turning a rule on while Asaas is not configured", () => {
    const refusal = receivingRulesRefusal(
      { requireReceivingAccount: true, paymentBeforePreparing: false },
      false,
    );

    expect(refusal).toBe(ASAAS_OFF_MESSAGE);
  });

  test("lets both rules be turned off while Asaas is not configured", () => {
    const refusal = receivingRulesRefusal(
      { requireReceivingAccount: false, paymentBeforePreparing: false },
      false,
    );

    expect(refusal).toBeNull();
  });

  test("accepts both rules on with Asaas configured", () => {
    const refusal = receivingRulesRefusal(
      { requireReceivingAccount: true, paymentBeforePreparing: true },
      true,
    );

    expect(refusal).toBeNull();
  });
});

describe("nextReceivingRules", () => {
  test("dates a rule turned on now", () => {
    const next = nextReceivingRules(
      RECEIVING_RULES_OFF,
      { requireReceivingAccount: true, paymentBeforePreparing: false },
      NOW,
    );

    expect(next).toEqual({ receivingAccountSince: NOW, paymentBeforePreparingSince: null });
  });

  test("keeps the date of a rule that was already on", () => {
    const next = nextReceivingRules(
      { receivingAccountSince: EARLIER, paymentBeforePreparingSince: null },
      { requireReceivingAccount: true, paymentBeforePreparing: true },
      NOW,
    );

    expect(next).toEqual({ receivingAccountSince: EARLIER, paymentBeforePreparingSince: NOW });
  });

  test("forgets the date of a rule turned off", () => {
    const next = nextReceivingRules(
      { receivingAccountSince: EARLIER, paymentBeforePreparingSince: EARLIER },
      { requireReceivingAccount: true, paymentBeforePreparing: false },
      NOW,
    );

    expect(next.paymentBeforePreparingSince).toBeNull();
  });
});

describe("preparationHoldFrom", () => {
  test("reads a known hold", () => {
    expect(preparationHoldFrom("payment")).toBe("payment");
  });

  test("reads no hold from null or an unknown value", () => {
    expect(preparationHoldFrom(null)).toBeNull();
    expect(preparationHoldFrom("something_else")).toBeNull();
  });
});
