import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-error-message";

const FALLBACK = "Não foi possível concluir. Tente novamente.";

// Regression: Better Auth's English messages reached the screen as they came.
describe("authErrorMessage", () => {
  it("translates the refusal for too many attempts", () => {
    const failure = { status: 429, message: "Too many requests. Please try again later." };
    expect(authErrorMessage(failure, FALLBACK)).toBe(
      "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
    );
  });

  it("translates the library's own codes", () => {
    const failure = { status: 403, code: "YOU_CANNOT_IMPERSONATE_ADMINS", message: "x" };
    expect(authErrorMessage(failure, FALLBACK)).toBe(
      "Não é possível entrar na conta de outro membro da equipe.",
    );
  });

  it("keeps a refusal the server already wrote in Portuguese", () => {
    const failure = { status: 403, code: "FORBIDDEN", message: "Indisponível durante o acesso" };
    expect(authErrorMessage(failure, FALLBACK)).toBe("Indisponível durante o acesso");
  });

  it("falls back when there is no message at all", () => {
    expect(authErrorMessage({ status: 500 }, FALLBACK)).toBe(FALLBACK);
  });
});
