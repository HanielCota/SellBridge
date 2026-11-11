import { describe, expect, it } from "vitest";
import { confirmationLinkNotice, isUnconfirmedEmail, signInErrorMessage } from "./sign-in-error";

describe("confirmationLinkNotice", () => {
  it("tells the person the e-mail is confirmed and asks for the password", () => {
    const notice = confirmationLinkNotice({ emailConfirmado: true });

    expect(notice).toEqual({
      confirmed: true,
      message: "E-mail confirmado. Entre com seu e-mail e senha.",
    });
  });

  it("explains an expired or used link instead of a Google failure", () => {
    const notice = confirmationLinkNotice({ emailConfirmado: true, error: "TOKEN_EXPIRED" });

    expect(notice?.confirmed).toBe(false);
    expect(notice?.message).toContain("Este link venceu ou já foi usado.");
  });

  it("stays quiet on a sign-in that did not come from the link", () => {
    expect(confirmationLinkNotice({ error: "access_denied" })).toBeNull();
  });
});

describe("isUnconfirmedEmail", () => {
  it("recognizes an account that still has to confirm its e-mail", () => {
    expect(isUnconfirmedEmail({ status: 403, code: "EMAIL_NOT_VERIFIED" })).toBe(true);
  });

  it("leaves a wrong password and a blocked account to the error message", () => {
    expect(isUnconfirmedEmail({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(false);
    expect(isUnconfirmedEmail({ status: 403, code: "BANNED_USER" })).toBe(false);
    expect(isUnconfirmedEmail({ status: 403 })).toBe(false);
  });
});

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
