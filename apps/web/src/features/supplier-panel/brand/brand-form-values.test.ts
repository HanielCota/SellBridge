import { describe, expect, it } from "vitest";
import { brandFormValues, hasBrandChanges } from "./brand-form-values";

describe("brandFormValues", () => {
  const account = { email: "loja@exemplo.com", name: "Distribuidora Passeio" };

  it("gives a new brand the login e-mail for orders and the default deadlines", () => {
    expect(brandFormValues(null, account)).toMatchObject({
      contactEmail: "loja@exemplo.com",
      acceptWithinHours: "24",
      dispatchWithinHours: "48",
    });
  });
});

describe("brandFormValues name", () => {
  // Regression: "Cadastre sua marca" opened with the name empty although the supplier had just
  // typed "Distribuidora Passeio" on sign-up.
  it("starts a new brand with the account name", () => {
    const values = brandFormValues(null, { email: "a@b.com", name: " Distribuidora Passeio " });

    expect(values.name).toBe("Distribuidora Passeio");
  });
});

describe("hasBrandChanges", () => {
  const saved = brandFormValues(null, { email: "loja@exemplo.com", name: "Loja" });

  it("is false while every field matches the saved values", () => {
    expect(hasBrandChanges({ ...saved }, saved)).toBe(false);
  });

  it("is true as soon as one field differs", () => {
    expect(hasBrandChanges({ ...saved, acceptWithinHours: "48" }, saved)).toBe(true);
  });
});
