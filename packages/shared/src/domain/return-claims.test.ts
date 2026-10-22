import { describe, expect, it } from "vitest";
import {
  assertClaimUndecided,
  assertCreditWithinCost,
  decideReturnClaimSchema,
  returnClaimSubject,
  supplierCreditShortText,
  supplierCreditText,
} from "./return-claims.ts";

const CLAIM_ID = "7d9f5a2e-3c1b-4f8a-9e6d-2b4c8a1f0e35";

describe("supplierCreditText", () => {
  it("says the credit is still under review", () => {
    expect(
      supplierCreditText({ status: "in_review", creditedCents: null, refusalReason: null }),
    ).toBe("Crédito do fornecedor: em análise");
  });

  it("says how much was credited", () => {
    expect(
      supplierCreditText({ status: "credited", creditedCents: 4590, refusalReason: null }),
    ).toBe("Crédito do fornecedor: R$ 45,90 creditado");
  });

  it("gives the reason when there is no credit", () => {
    expect(
      supplierCreditText({
        status: "refused",
        creditedCents: null,
        refusalReason: "produto voltou usado",
      }),
    ).toBe("Não creditado: produto voltou usado");
  });
});

describe("supplierCreditShortText", () => {
  it("fits each outcome under the order's amount", () => {
    expect(
      supplierCreditShortText({ status: "in_review", creditedCents: null, refusalReason: null }),
    ).toBe("crédito em análise");
    expect(
      supplierCreditShortText({ status: "credited", creditedCents: 1000, refusalReason: null }),
    ).toBe("R$ 10,00 creditado");
    expect(
      supplierCreditShortText({ status: "refused", creditedCents: null, refusalReason: "uso" }),
    ).toBe("sem crédito do fornecedor");
  });
});

describe("assertCreditWithinCost", () => {
  it("accepts the full supplier cost and anything below it", () => {
    expect(assertCreditWithinCost(5000, 5000)).toBe(5000);
    expect(assertCreditWithinCost(1, 5000)).toBe(1);
  });

  it("never lets the credit go above what the reseller paid the supplier", () => {
    expect(() => assertCreditWithinCost(5001, 5000)).toThrow(/não pode passar do custo/);
  });

  it("refuses zero and negative amounts", () => {
    expect(() => assertCreditWithinCost(0, 5000)).toThrow(/maior que zero/);
    expect(() => assertCreditWithinCost(-10, 5000)).toThrow(/maior que zero/);
  });
});

describe("assertClaimUndecided", () => {
  it("lets a claim under review be decided", () => {
    expect(() => assertClaimUndecided("in_review")).not.toThrow();
  });

  it("refuses a second decision", () => {
    expect(() => assertClaimUndecided("credited")).toThrow(/já foi decidida/);
    expect(() => assertClaimUndecided("refused")).toThrow(/já foi decidida/);
  });
});

describe("decideReturnClaimSchema", () => {
  it("reads a credit with its amount in cents", () => {
    const parsed = decideReturnClaimSchema.parse({
      claimId: CLAIM_ID,
      decision: "credit",
      amountCents: 1200,
    });
    expect(parsed).toEqual({ claimId: CLAIM_ID, decision: "credit", amountCents: 1200 });
  });

  it("asks for a reason when there is no credit", () => {
    const parsed = decideReturnClaimSchema.safeParse({
      claimId: CLAIM_ID,
      decision: "refuse",
      reason: "  ",
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a fractional amount", () => {
    const parsed = decideReturnClaimSchema.safeParse({
      claimId: CLAIM_ID,
      decision: "credit",
      amountCents: 10.5,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("returnClaimSubject", () => {
  it("names the order the parcel belonged to", () => {
    expect(returnClaimSubject("2000012345")).toBe("Devolução do pedido 2000012345");
  });
});
