/** The error the Better Auth client hands back from a failed call. */
export interface AuthFailure {
  status: number;
  code?: string | undefined;
  message?: string | undefined;
}

const TOO_MANY_REQUESTS = 429;

/** Better Auth's own codes the account and team screens can meet, in Portuguese. */
const PORTUGUESE_BY_CODE: Readonly<Record<string, string>> = {
  INVALID_PASSWORD: "Senha incorreta",
  SESSION_EXPIRED: "Por segurança, saia e entre de novo antes de continuar.",
  USER_NOT_FOUND: "Conta não encontrada.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Esta conta entra pelo Google e não tem senha.",
  YOU_CANNOT_IMPERSONATE_ADMINS: "Não é possível entrar na conta de outro membro da equipe.",
  YOU_ARE_NOT_ALLOWED_TO_IMPERSONATE_USERS:
    "Sua função na equipe não permite entrar na conta deste cliente.",
};

/**
 * Better Auth answers in English; those answers are translated here. A refusal the server raised
 * itself (an `APIError` from our hooks) is already written in Portuguese and is shown as it came.
 */
export function authErrorMessage(failure: AuthFailure, fallback: string): string {
  if (failure.status === TOO_MANY_REQUESTS) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  const translated = PORTUGUESE_BY_CODE[failure.code ?? ""];
  if (translated !== undefined) {
    return translated;
  }
  return failure.message ?? fallback;
}
