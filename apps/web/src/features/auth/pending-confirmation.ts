/*
 * The address a new sign-up must confirm, kept in this tab only so "Confira seu e-mail" can name it
 * and resend the link. Never in the URL: an e-mail is personal data.
 */

import { reportRouteError } from "@/lib/report-route-error";

const PENDING_EMAIL_KEY = "sellbridge.pending-confirmation-email";

/** Called right after the sign-up, before opening "Confira seu e-mail". */
export function rememberPendingConfirmation(email: string): void {
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch (error) {
    // Storage off (private mode): the page then explains without naming the address.
    void reportRouteError(error, "/_auth/confirme-seu-email");
  }
}

/** The address of the sign-up in this tab, or null when the tab does not know it. */
export function readPendingConfirmation(): string | null {
  try {
    const stored = sessionStorage.getItem(PENDING_EMAIL_KEY);
    if (stored === null || stored.trim() === "") {
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}
