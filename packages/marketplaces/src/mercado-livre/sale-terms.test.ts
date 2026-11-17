import { describe, expect, it } from "vitest";
import { saleTermsFor } from "./sale-terms.ts";

describe("saleTermsFor", () => {
  it("sends the seller's warranty with its time in days", () => {
    const terms = saleTermsFor({ warrantyType: "seller", warrantyDays: 90, madeToOrderDays: null });

    expect(terms).toEqual([
      { id: "WARRANTY_TYPE", value_name: "Garantia do vendedor" },
      { id: "WARRANTY_TIME", value_name: "90 dias" },
    ]);
  });

  it("sends no time with a product without warranty", () => {
    const terms = saleTermsFor({ warrantyType: "none", warrantyDays: 30, madeToOrderDays: null });

    expect(terms).toEqual([{ id: "WARRANTY_TYPE", value_name: "Sem garantia" }]);
  });

  it("sends the made-to-order time on its own", () => {
    const terms = saleTermsFor({ warrantyType: null, warrantyDays: null, madeToOrderDays: 7 });

    expect(terms).toEqual([{ id: "MANUFACTURING_TIME", value_name: "7 dias" }]);
  });

  it("sends nothing when the supplier said nothing", () => {
    expect(saleTermsFor(undefined)).toEqual([]);
    expect(saleTermsFor({ warrantyType: null, warrantyDays: null, madeToOrderDays: null })).toEqual(
      [],
    );
  });
});
