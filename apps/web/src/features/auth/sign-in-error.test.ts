import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-error";

// Regression (25/10/2026, idioma-pt): the login showed "E-mail ou senha incorretos." for every
// error, also too many attempts, a blocked account and a server that did not answer.
describe("signInErrorMessage", () => {
  it("keeps one message for a wrong e-mail or password", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "E-mail ou senha incorretos.",
    );
    expect(signInErrorMessage({ status: 400 })).toBe("E-mail ou senha incorretos.");
  });

  it("tells the person to wait after too many attempts", () => {
    expect(signInErrorMessage({ status: 429 })).toBe(
      "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
    );
  });

  it("tells a blocked account why it cannot enter", () => {
    expect(signInErrorMessage({ status: 403, code: "BANNED_USER" })).toBe(
      "Esta conta está bloqueada. Fale com o suporte para entender o motivo.",
    );
  });

  it("does not blame the password when the server failed", () => {
    expect(signInErrorMessage({ status: 500 })).toBe(
      "Não foi possível entrar agora. Confira sua conexão e tente de novo.",
    );
  });

  it("does not blame the password when the request got no answer", () => {
    expect(signInErrorMessage({ status: 0 })).toBe(
      "Não foi possível entrar agora. Confira sua conexão e tente de novo.",
    );
  });
});
