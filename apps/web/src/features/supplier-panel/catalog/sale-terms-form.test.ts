import { describe, expect, it } from "vitest";
import { saleTermsFormValues, saleTermsInput, saleTermsMissing } from "./sale-terms-form";

const EMPTY = saleTermsFormValues();

describe("saleTermsFormValues", () => {
  it("shows stored terms, made-to-order switched on when it has days", () => {
    const values = saleTermsFormValues({
      warrantyType: "seller",
      warrantyDays: 90,
      videoUrl: "https://youtu.be/abc123DEF45",
      madeToOrderDays: 5,
      carrierOnly: true,
    });

    expect(values).toEqual({
      warrantyType: "seller",
      warrantyDays: "90",
      videoUrl: "https://youtu.be/abc123DEF45",
      madeToOrder: true,
      madeToOrderDays: "5",
      carrierOnly: true,
    });
  });

  it("starts a new product with nothing chosen", () => {
    expect(EMPTY).toMatchObject({ warrantyType: "", madeToOrder: false, carrierOnly: false });
  });
});

describe("saleTermsInput", () => {
  it("drops the days of a warranty type without time and of a switched-off made-to-order", () => {
    const input = saleTermsInput({
      ...EMPTY,
      warrantyType: "none",
      warrantyDays: "30",
      madeToOrder: false,
      madeToOrderDays: "5",
    });

    expect(input).toMatchObject({
      warrantyType: "none",
      warrantyDays: null,
      madeToOrderDays: null,
    });
  });

  it("turns a typo into NaN so the schema names the field", () => {
    const input = saleTermsInput({ ...EMPTY, warrantyType: "seller", warrantyDays: "90d" });

    expect(input.warrantyDays).toBeNaN();
  });
});

describe("saleTermsMissing", () => {
  it("asks for the warranty days and the made-to-order days while they are blank", () => {
    const missing = saleTermsMissing({ ...EMPTY, warrantyType: "factory", madeToOrder: true });

    expect(Object.keys(missing)).toEqual(["warrantyDays", "madeToOrderDays"]);
  });

  it("asks for nothing when no warranty and no made-to-order were chosen", () => {
    expect(saleTermsMissing(EMPTY)).toEqual({});
  });
});
