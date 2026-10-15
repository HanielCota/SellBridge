import { logger } from "@sellbridge/shared/logger";

/** What saving a customer's name and e-mail needs from Better Auth, the mailer and the trail. */
export interface ProfileSaveSteps {
  updateUser(data: { name: string; email: string; emailVerified?: false }): Promise<void>;
  /** Sends the confirmation link to the new address. */
  sendVerification(email: string): Promise<void>;
  /** Tells the old address that the team moved the account elsewhere. */
  notifyPreviousAddress(input: { previousEmail: string; maskedEmail: string }): Promise<void>;
  record(action: "profile_updated" | "email_changed"): Promise<void>;
}

export interface ProfileChange {
  name: string;
  previousEmail: string;
  /** Already lowercased. */
  email: string;
}

/** "nova.conta@loja.com.br" → "n***@loja.com.br": enough to recognise, not to reuse. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  const first = email.slice(0, 1);
  return `${first}***${at === -1 ? "" : email.slice(at)}`;
}

/** A message that cannot go out is logged: the change itself already happened. */
async function sendQuietly(kind: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (error) {
    logger.warn("admin.email_change_message_failed", { kind, error });
  }
}

/**
 * Saves the name and e-mail an admin typed. A new address is not proven by anyone yet: it loses
 * the verified mark, gets the confirmation link, and the old address hears about the change.
 */
export async function saveCustomerProfile(
  change: ProfileChange,
  steps: ProfileSaveSteps,
): Promise<{ emailChanged: boolean }> {
  const emailChanged = change.previousEmail.toLowerCase() !== change.email;
  if (!emailChanged) {
    await steps.updateUser({ name: change.name, email: change.email });
    await steps.record("profile_updated");
    return { emailChanged };
  }
  await steps.updateUser({ name: change.name, email: change.email, emailVerified: false });
  // The messages go out first: the old address must hear about the change even if the trail
  // fails to record it.
  await sendQuietly("verification", async () => steps.sendVerification(change.email));
  await sendQuietly("previous_address", async () =>
    steps.notifyPreviousAddress({
      previousEmail: change.previousEmail,
      maskedEmail: maskEmail(change.email),
    }),
  );
  await steps.record("email_changed");
  return { emailChanged };
}
