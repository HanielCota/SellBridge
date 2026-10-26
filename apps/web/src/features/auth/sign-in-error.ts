/** What the sign-in form reads from a failed Better Auth call. */
export interface SignInFailure {
  status: number;
  code?: string | undefined;
}

const TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR = 500;

const WRONG_CREDENTIALS = "E-mail ou senha incorretos.";

/** Codes Better Auth only returns once the password was right, so naming them reveals nothing. */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  BANNED_USER: "Esta conta está bloqueada. Fale com o suporte para entender o motivo.",
};

/**
 * The sign-in form's message. A wrong e-mail and a wrong password stay one message, so the form
 * never tells which accounts exist; too many attempts, a blocked account and an unreachable
 * server get their own, instead of all reading as a wrong password.
 */
export function signInErrorMessage(failure: SignInFailure): string {
  if (failure.status === TOO_MANY_REQUESTS) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }

  if (failure.status === 0 || failure.status >= FIRST_SERVER_ERROR) {
    return "Não foi possível entrar agora. Confira sua conexão e tente de novo.";
  }

  return MESSAGE_BY_CODE[failure.code ?? ""] ?? WRONG_CREDENTIALS;
}
