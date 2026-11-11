import { TERMS_VERSION } from "@sellbridge/shared/terms";
import { describe, expect, it } from "vitest";
import { parseSignUpBody } from "./sign-up-body.ts";

const SIGN_UP = {
  name: "Ateliê Barro",
  email: "atelie@exemplo.com.br",
  password: "senha-segura-123",
  acceptedTermsVersion: TERMS_VERSION,
};

describe("parseSignUpBody", () => {
  it("accepts a sign-up with the name and the terms in force", () => {
    const result = parseSignUpBody(SIGN_UP);

    expect(result).toMatchObject({ success: true, data: { acceptedTermsVersion: TERMS_VERSION } });
  });

  it("refuses a sign-up without the terms", () => {
    const { acceptedTermsVersion: _terms, ...withoutTerms } = SIGN_UP;

    const result = parseSignUpBody(withoutTerms);

    expect(result).toEqual({
      success: false,
      message: "Marque que você aceita os termos para criar a conta.",
    });
  });

  it("refuses terms that are not the version in force", () => {
    const result = parseSignUpBody({ ...SIGN_UP, acceptedTermsVersion: "2020-01-01" });

    expect(result.success).toBe(false);
  });

  it("refuses a blank name", () => {
    const result = parseSignUpBody({ ...SIGN_UP, name: "  " });

    expect(result).toEqual({ success: false, message: "Informe seu nome" });
  });

  it("refuses a profile photo sent with the sign-up", () => {
    const result = parseSignUpBody({ ...SIGN_UP, image: "https://outro-site.example/foto.png" });

    expect(result.success).toBe(false);
  });
});
