/*
 * "New message" e-mails for one parcel and one author: at most one every window, and at least one
 * every window while new messages keep coming. Each message still goes to the conversation and
 * the bell; only the e-mail waits. Without a cap, 50 messages in a row were 50 e-mails in the
 * other side's inbox and the sending quota.
 */

export const ORDER_MESSAGE_EMAIL_WINDOW_MINUTES = 15;
const WINDOW_MILLISECONDS = ORDER_MESSAGE_EMAIL_WINDOW_MINUTES * 60_000;

/**
 * Whether the newest of the author's messages gets an e-mail. Replays every message of the author
 * on the parcel, oldest first: one is e-mailed when it is the first, or comes a whole window after
 * the last one that was e-mailed. Comparing with the previous message instead silenced a steady
 * conversation (a message every 10 minutes got a single e-mail). Read from the messages
 * themselves, so it needs no record of what was sent (no migration) and agrees across instances.
 */
export function shouldEmailLatestOrderMessage(messageTimes: readonly Date[]): boolean {
  const ordered = messageTimes
    .map((time) => time.getTime())
    .toSorted((left, right) => left - right);
  // Positions, not times: two messages in the same instant must not both count as e-mailed.
  const emailed = ordered.reduce<number[]>((sent, time, index) => {
    const last = sent.at(-1);
    const lastTime = last === undefined ? undefined : ordered[last];
    if (lastTime === undefined || time - lastTime >= WINDOW_MILLISECONDS) {
      return [...sent, index];
    }
    return sent;
  }, []);
  return ordered.length > 0 && emailed.at(-1) === ordered.length - 1;
}
