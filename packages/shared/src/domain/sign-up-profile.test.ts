import { describe, expect, it } from "vitest";
import { resolveSignUpProfileKind, signUpProfileKindSchema } from "./sign-up-profile.ts";

describe("resolveSignUpProfileKind", () => {
  it("creates a seller profile when no profile kind is chosen", () => {
    expect(resolveSignUpProfileKind(undefined)).toBe("seller");
  });

  it("creates a supplier profile when the supplier card is chosen", () => {
    expect(resolveSignUpProfileKind("supplier")).toBe("supplier");
  });

  it("ignores a remembered value that is not a profile kind", () => {
    expect(resolveSignUpProfileKind("admin")).toBe("seller");
  });
});

describe("signUpProfileKindSchema", () => {
  it("rejects an unknown profile kind with a clear message", () => {
    const result = signUpProfileKindSchema.safeParse("admin");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Tipo de conta inválido: recebido "admin", esperado "seller" ou "supplier".',
    );
  });
});
