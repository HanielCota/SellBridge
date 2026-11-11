/** What the sign-in form reads from a failed Better Auth call. */
export interface SignInFailure {
  readonly status: number;
  readonly code?: string | undefined;
}

/** A sign-in request that never got an answer (offline, connection dropped). */
export const NO_RESPONSE = 0;
const TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR = 500;

const WRONG_CREDENTIALS = "E-mail ou senha incorretos.";

/**
 * Where the confirmation link lands: the sign-in, which then opens the account's setup. The link
 * opens no session, so neither a mail scanner that fetches it nor whoever opens it enters an
 * account someone else may have registered with this address.
 */
export const CONFIRMATION_CALLBACK_URL = "/login?emailConfirmado=true&redirect=%2Fonboarding";

/** What the sign-in reads from the address the confirmation link redirected to. */
export interface ConfirmationLinkArrival {
  readonly emailConfirmado?: boolean | undefined;
  /** Better Auth's code when the link was expired, invalid or for a removed account. */
  readonly error?: string | undefined;
}

export interface ConfirmationLinkNotice {
  readonly confirmed: boolean;
  readonly message: string;
}

/** The notice above the sign-in after the confirmation link, or null for any other visit. */
export function confirmationLinkNotice(
  arrival: ConfirmationLinkArrival,
): ConfirmationLinkNotice | null {
  if (arrival.emailConfirmado !== true) {
    return null;
  }
  if (arrival.error !== undefined) {
    return {
      confirmed: false,
      message:
        "Este link venceu ou já foi usado. Entre com seu e-mail e senha: se ainda faltar confirmar, enviamos um link novo.",
    };
  }
  return { confirmed: true, message: "E-mail confirmado. Entre com seu e-mail e senha." };
}

/** Better Auth's code for an account that must confirm its e-mail before it gets a session. */
export const EMAIL_NOT_CONFIRMED_CODE = "EMAIL_NOT_VERIFIED";

/**
 * The password was right but the e-mail is not confirmed yet: the login shows the notice with the
 * new link instead of an error. The server only answers this after checking the password.
 */
export function isUnconfirmedEmail(failure: SignInFailure): boolean {
  return failure.code === EMAIL_NOT_CONFIRMED_CODE;
}

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

  if (failure.status === NO_RESPONSE || failure.status >= FIRST_SERVER_ERROR) {
    return "Não foi possível entrar agora. Confira sua conexão e tente de novo.";
  }

  return MESSAGE_BY_CODE[failure.code ?? ""] ?? WRONG_CREDENTIALS;
}
