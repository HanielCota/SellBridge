import type { SupplierInviteReading } from "./invite-token";

/** The invited supplier, as the invite page needs it. */
export interface InviteTarget {
  name: string;
  contactEmail: string | null;
  hasPanel: boolean;
  /** A supplier the team switched off takes no panel owner. */
  active: boolean;
}

/** The signed-in person opening the invite, or null when no one is signed in. */
export interface InviteViewer {
  email: string;
  emailVerified: boolean;
}

/** What the invite page shows; only "ready" lets the person link the supplier to the account. */
export type InviteState =
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "claimed" }
  | { status: "inactive" }
  | { status: "no_email" }
  | { status: "signed_out"; supplierName: string; maskedEmail: string }
  | { status: "wrong_email"; maskedEmail: string }
  | { status: "unconfirmed"; maskedEmail: string }
  | { status: "ready"; supplierName: string };

/** "pedidos@loja.com.br" → "p***@loja.com.br": enough to recognise, not to reuse. */
export function maskInviteEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return `${email.slice(0, 1)}***${at === -1 ? "" : email.slice(at)}`;
}

function sameEmail(first: string, second: string): boolean {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

/**
 * Who may take the supplier: only an account whose confirmed e-mail is the supplier's order
 * e-mail, while the supplier still has no owner. A leaked invite alone opens nothing.
 */
export function inviteStateOf(input: {
  reading: SupplierInviteReading;
  target: InviteTarget | null;
  viewer: InviteViewer | null;
}): InviteState {
  const { reading, target, viewer } = input;
  if (reading.status !== "valid" || target === null) {
    return { status: reading.status === "expired" ? "expired" : "invalid" };
  }
  if (target.hasPanel) {
    return { status: "claimed" };
  }
  if (!target.active) {
    return { status: "inactive" };
  }
  if (target.contactEmail === null || target.contactEmail.trim() === "") {
    return { status: "no_email" };
  }
  const maskedEmail = maskInviteEmail(target.contactEmail);
  if (viewer === null) {
    return { status: "signed_out", supplierName: target.name, maskedEmail };
  }
  if (!sameEmail(viewer.email, target.contactEmail)) {
    return { status: "wrong_email", maskedEmail };
  }
  if (!viewer.emailVerified) {
    return { status: "unconfirmed", maskedEmail };
  }
  return { status: "ready", supplierName: target.name };
}
