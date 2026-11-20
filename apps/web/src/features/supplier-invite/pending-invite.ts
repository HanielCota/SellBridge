import { supplierInviteTokenSchema } from "./invite-token-schema";

const PENDING_INVITE_KEY = "sellbridge-supplier-invite";

/**
 * Where the sign-in and the sign-up send the person back to. The invite itself waits in this
 * browser, so its token never travels in a `redirect` (access logs, history, the confirmation
 * e-mail's address).
 */
export const INVITE_RETURN_PATH = "/fornecedor/convite";

/** Keeps the invite for the way back; false when the browser keeps nothing (private window). */
export function rememberPendingInvite(token: string): boolean {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** The invite this browser is coming back to, or null when there is none or storage is off. */
export function pendingInvite(): string | null {
  try {
    const parsed = supplierInviteTokenSchema.safeParse(localStorage.getItem(PENDING_INVITE_KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Drops the invite once it was used; false when the browser keeps nothing. */
export function forgetPendingInvite(): boolean {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
    return true;
  } catch {
    return false;
  }
}
