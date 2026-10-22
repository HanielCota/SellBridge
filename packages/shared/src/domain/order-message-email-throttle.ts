/*
 * At most one "new message" e-mail per parcel, per author, every window. Each message still goes
 * to the conversation and the bell; only the e-mail waits. Without it, 50 messages in a row were
 * 50 e-mails in the other side's inbox and the sending quota.
 */

export const ORDER_MESSAGE_EMAIL_WINDOW_MINUTES = 15;
const WINDOW_MILLISECONDS = ORDER_MESSAGE_EMAIL_WINDOW_MINUTES * 60_000;

/**
 * Whether this message gets an e-mail: the author's first on the parcel, or the first after the
 * author was quiet for the whole window. Read from the messages themselves, so it needs no
 * record of what was e-mailed (no migration) and holds across app instances.
 */
export function shouldEmailOrderMessage(input: {
  previousMessageAt: Date | null;
  now: Date;
}): boolean {
  if (input.previousMessageAt === null) {
    return true;
  }
  return input.now.getTime() - input.previousMessageAt.getTime() >= WINDOW_MILLISECONDS;
}
