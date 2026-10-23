/*
 * Where "Voltar" takes the team after a visit to a customer's account: back to the admin page the
 * visit started from (the ticket, the supplier list). Agents and supervisors cannot open the
 * customer pages, so a fixed "/admin/clientes" left them on a refusal.
 */

const RETURN_KEY = "sellbridge.impersonation-return";
/** Every team role reaches the ticket inbox. */
export const DEFAULT_RETURN_PATH = "/admin/chamados";
/** Only an admin page of this site: never another origin ("//evil.test") nor a customer page. */
const ADMIN_PATH = /^\/admin(?:[/?#]|$)/;

/** The stored page when it is an admin page of this site, or the inbox. */
export function safeReturnPath(stored: string | null): string {
  if (stored === null || !ADMIN_PATH.test(stored)) {
    return DEFAULT_RETURN_PATH;
  }
  return stored;
}

/** Called right before entering: the page and its search, as the visit will replace both. */
export function rememberReturnPath(path: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Storage off (private mode): "Voltar" then opens the inbox, which every role can see.
  }
}

/** Read once when leaving the visit; the tab forgets it afterwards. */
export function takeReturnPath(): string {
  try {
    const stored = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return safeReturnPath(stored);
  } catch {
    // Same fallback as an empty storage: the inbox.
    return DEFAULT_RETURN_PATH;
  }
}
