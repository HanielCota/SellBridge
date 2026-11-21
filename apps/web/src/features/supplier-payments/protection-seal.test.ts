import { describe, expect, test } from "vitest";
import { showsProtectionSeal } from "./protection-seal";

const refunding = { kind: "refunding" } as const;

describe("showsProtectionSeal", () => {
  test("keeps the seal while Asaas still holds a refund the team makes by hand", () => {
    const shown = showsProtectionSeal({
      protectedPayment: true,
      badge: refunding,
      manualRefund: { releasedToSupplier: false },
    });

    expect(shown).toBe(true);
  });

  test("drops the seal once Asaas released the money to the supplier", () => {
    const shown = showsProtectionSeal({
      protectedPayment: true,
      badge: refunding,
      manualRefund: { releasedToSupplier: true },
    });

    expect(shown).toBe(false);
  });

  test("drops the seal once the money came back", () => {
    const shown = showsProtectionSeal({
      protectedPayment: true,
      badge: { kind: "refunded", refundedAt: null },
      manualRefund: null,
    });

    expect(shown).toBe(false);
  });
});
