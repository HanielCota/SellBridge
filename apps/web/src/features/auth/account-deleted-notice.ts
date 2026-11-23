/** Where the browser goes once the account is deleted: the sign-in, saying what just happened. */
export const ACCOUNT_DELETED_LOGIN_PATH = "/login?contaExcluida=true";

export const ACCOUNT_DELETED_MESSAGE =
  "Sua conta foi excluída. Se quiser voltar, é só criar uma conta nova.";

/** The notice above the sign-in right after a deletion, or null for any other visit. */
export function accountDeletedNotice(arrival: {
  contaExcluida?: boolean | undefined;
}): string | null {
  if (arrival.contaExcluida !== true) {
    return null;
  }
  return ACCOUNT_DELETED_MESSAGE;
}
