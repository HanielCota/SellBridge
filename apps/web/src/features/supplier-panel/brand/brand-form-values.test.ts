import { describe, expect, it } from "vitest";
import { brandFormValues, hasBrandChanges } from "./brand-form-values";

describe("brandFormValues", () => {
  it("gives a new brand the login e-mail for orders and the default deadlines", () => {
    expect(brandFormValues(null, "loja@exemplo.com")).toMatchObject({
      contactEmail: "loja@exemplo.com",
      acceptWithinHours: "24",
      dispatchWithinHours: "48",
    });
  });
});

describe("hasBrandChanges", () => {
  const saved = brandFormValues(null, "loja@exemplo.com");

  it("is false while every field matches the saved values", () => {
    expect(hasBrandChanges({ ...saved }, saved)).toBe(false);
  });

  it("is true as soon as one field differs", () => {
    expect(hasBrandChanges({ ...saved, acceptWithinHours: "48" }, saved)).toBe(true);
  });
});
