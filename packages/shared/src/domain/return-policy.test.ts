import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  assertReasonCanChange,
  forwardDeadline,
  isPastDeadline,
  obligationText,
  resellableByDefault,
  statedReasonSchema,
  supplierAnswerDeadline,
  supplierAnswerSchema,
  supplierObligation,
} from "./return-policy.ts";

const CLAIM_ID = "7d1c2b9e-4f7a-4c55-9d5e-1a2b3c4d5e6f";

describe("addBusinessDays", () => {
  it("gives a Monday arrival with 3 business days until Thursday ends, in Brasília", () => {
    const mondayMorning = new Date("2026-11-16T10:00:00-03:00");

    const deadline = addBusinessDays(mondayMorning, 3);

    expect(deadline.toISOString()).toBe("2026-11-20T03:00:00.000Z");
  });

  it("skips the weekend for a Friday arrival", () => {
    const fridayAfternoon = new Date("2026-11-20T15:00:00-03:00");

    const deadline = addBusinessDays(fridayAfternoon, 3);

    expect(deadline.toISOString()).toBe("2026-11-26T03:00:00.000Z");
  });

  it("starts a Saturday arrival on Monday", () => {
    const saturday = new Date("2026-11-21T11:00:00-03:00");

    const deadline = addBusinessDays(saturday, 1);

    expect(deadline.toISOString()).toBe("2026-11-24T03:00:00.000Z");
  });

  it.each([0, 6, 2.5, Number.NaN])("refuses %s business days", (businessDays) => {
    const monday = new Date("2026-11-16T10:00:00-03:00");

    expect(() => addBusinessDays(monday, businessDays)).toThrow("dias úteis");
  });

  it("refuses an invalid start date", () => {
    expect(() => addBusinessDays(new Date("not a date"), 3)).toThrow("Invalid");
  });
});

describe("supplierAnswerDeadline", () => {
  it("ends a day before the marketplace's review date when there is one", () => {
    const marketplaceDueAt = new Date("2026-11-19T12:00:00.000Z");

    const deadline = supplierAnswerDeadline({
      arrivedAt: new Date("2026-11-16T10:00:00-03:00"),
      marketplaceDueAt,
      businessDays: 3,
    });

    expect(deadline.toISOString()).toBe("2026-11-18T12:00:00.000Z");
  });

  it("counts the admin's business days from the arrival without a marketplace date", () => {
    const deadline = supplierAnswerDeadline({
      arrivedAt: new Date("2026-11-16T10:00:00-03:00"),
      marketplaceDueAt: null,
      businessDays: 2,
    });

    expect(deadline.toISOString()).toBe("2026-11-19T03:00:00.000Z");
  });
});

describe("forwardDeadline", () => {
  it("gives the reseller 7 calendar days to send the parcel on", () => {
    const deadline = forwardDeadline(new Date("2026-11-16T10:00:00.000Z"));

    expect(deadline.toISOString()).toBe("2026-11-23T10:00:00.000Z");
  });
});

describe("supplierObligation", () => {
  it("charges the supplier the cost and the return label for a defect", () => {
    const obligation = supplierObligation({
      reason: "defect",
      supplierCostCents: 8_000,
      returnShippingCents: 2_290,
    });

    expect(obligation).toEqual({
      costCents: 8_000,
      shippingCents: 2_290,
      shippingPayer: "supplier",
    });
  });

  it("leaves the return label with the reseller when the buyer gave up", () => {
    const obligation = supplierObligation({
      reason: "regret",
      supplierCostCents: 8_000,
      returnShippingCents: 2_290,
    });

    expect(obligation).toEqual({ costCents: 8_000, shippingCents: 0, shippingPayer: "seller" });
  });

  it("treats a return the reseller never explained as the buyer giving up", () => {
    const obligation = supplierObligation({
      reason: null,
      supplierCostCents: 8_000,
      returnShippingCents: 2_290,
    });

    expect(obligation.shippingPayer).toBe("seller");
    expect(obligation.shippingCents).toBe(0);
  });

  it("counts no shipping when the reseller did not say what the label cost", () => {
    const obligation = supplierObligation({
      reason: "wrong_item",
      supplierCostCents: 8_000,
      returnShippingCents: null,
    });

    expect(obligation.shippingCents).toBe(0);
  });
});

describe("obligationText", () => {
  it("names the cost and the shipping", () => {
    expect(obligationText({ costCents: 8_000, shippingCents: 2_290 })).toBe(
      "Fornecedor deve R$ 80,00 de custo + R$ 22,90 de frete",
    );
  });

  it("names only the cost when there is no shipping to pay", () => {
    expect(obligationText({ costCents: 8_000, shippingCents: 0 })).toBe(
      "Fornecedor deve R$ 80,00 de custo",
    );
  });
});

describe("resellableByDefault", () => {
  it("expects a defective product not to go back on sale", () => {
    expect(resellableByDefault("defect")).toBe(false);
  });

  it("expects a product the buyer gave up on to go back on sale", () => {
    expect(resellableByDefault("regret")).toBe(true);
  });
});

describe("assertReasonCanChange", () => {
  it("lets the reseller change the reason while the supplier has not answered", () => {
    expect(() => assertReasonCanChange("awaiting_supplier", false)).not.toThrow();
  });

  it("freezes the reason once the supplier answered", () => {
    expect(() => assertReasonCanChange("awaiting_supplier", true)).toThrow("já respondeu");
  });

  it("freezes the reason once the return is closed", () => {
    expect(() => assertReasonCanChange("closed", false)).toThrow("já respondeu");
  });
});

describe("isPastDeadline", () => {
  const deadline = new Date("2026-11-20T03:00:00.000Z");

  it("is on time a moment before the deadline", () => {
    expect(isPastDeadline(deadline, new Date("2026-11-20T02:59:59.000Z"))).toBe(false);
  });

  it("is late at the deadline itself", () => {
    expect(isPastDeadline(deadline, deadline)).toBe(true);
  });

  it("never expires without a deadline", () => {
    expect(isPastDeadline(null, new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
  });
});

describe("statedReasonSchema", () => {
  it("refuses a negative return label", () => {
    const parsed = statedReasonSchema.safeParse({
      claimId: CLAIM_ID,
      reason: "defect",
      note: "",
      returnShippingCents: -1,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("supplierAnswerSchema", () => {
  it("asks how the product arrived when the supplier disagrees", () => {
    const parsed = supplierAnswerSchema.safeParse({
      claimId: CLAIM_ID,
      verdict: "not_as_described",
      condition: "  ",
      resellable: true,
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts an agreement with no words", () => {
    const parsed = supplierAnswerSchema.safeParse({
      claimId: CLAIM_ID,
      verdict: "as_described",
      condition: "",
      resellable: false,
    });

    expect(parsed.success).toBe(true);
  });
});
