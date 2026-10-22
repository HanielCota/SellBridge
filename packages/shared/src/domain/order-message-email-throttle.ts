/*
 * "New message" e-mails for one parcel and one author: at most one every window, and at least one
 * every window while new messages wait to be read. Each message still goes to the conversation
 * and the bell; only the e-mail waits. Without a cap, 50 messages in a row were 50 e-mails in the
 * other side's inbox and the sending quota.
 */

export const ORDER_MESSAGE_EMAIL_WINDOW_MINUTES = 15;
const WINDOW_MILLISECONDS = ORDER_MESSAGE_EMAIL_WINDOW_MINUTES * 60_000;

export type OrderMessageAuthor = "reseller" | "supplier";

export interface OrderMessageMoment {
  at: Date;
  author: OrderMessageAuthor;
}

export interface OrderMessageEmailPlan {
  /** E-mail the other side now. */
  sendNow: boolean;
  /** A message waits inside the window: e-mail at this time, unless the other side replies. */
  followUpAt: Date | null;
}

interface Replay {
  /** When the author's last e-mail went out (a message's own, or a follow-up's). */
  lastEmail: number | null;
  /** A message of the author not e-mailed yet and not answered by the other side. */
  pending: boolean;
}

function replayMessage(state: Replay, message: { at: number; mine: boolean }): Replay {
  const { lastEmail } = state;
  // A follow-up due before this message went out at the end of its window.
  const fired =
    state.pending && lastEmail !== null && lastEmail + WINDOW_MILLISECONDS <= message.at
      ? { lastEmail: lastEmail + WINDOW_MILLISECONDS, pending: false }
      : state;
  if (!message.mine) {
    // The other side wrote: it was in the conversation, so nothing waits for it any more.
    return { ...fired, pending: false };
  }
  if (fired.lastEmail === null || message.at - fired.lastEmail >= WINDOW_MILLISECONDS) {
    return { lastEmail: message.at, pending: false };
  }
  return { ...fired, pending: true };
}

/**
 * What to do about `author`'s messages: on `"message"`, right after one is saved (e-mail it if it
 * opens a window, or schedule the end of the window); on `"follow_up"`, when that scheduled time
 * comes (e-mail if a message still waits). Replays every message of the parcel up to `now`, so it
 * needs no record of what was sent (no migration) and answers the same on any instance.
 */
export function planOrderMessageEmail(input: {
  messages: readonly OrderMessageMoment[];
  author: OrderMessageAuthor;
  trigger: "message" | "follow_up";
  now: Date;
}): OrderMessageEmailPlan {
  const now = input.now.getTime();
  const ordered = input.messages
    .map((message) => ({ at: message.at.getTime(), mine: message.author === input.author }))
    .filter((message) => message.at <= now)
    .toSorted((left, right) => left.at - right.at);
  const state = ordered.reduce<Replay>(replayMessage, { lastEmail: null, pending: false });
  if (state.lastEmail === null) {
    return { sendNow: false, followUpAt: null };
  }
  const due = state.lastEmail + WINDOW_MILLISECONDS;
  if (input.trigger === "follow_up") {
    return { sendNow: state.pending && due <= now, followUpAt: null };
  }
  const newest = ordered.findLast((message) => message.mine);
  if (!state.pending) {
    return { sendNow: newest !== undefined && newest.at === state.lastEmail, followUpAt: null };
  }
  return { sendNow: false, followUpAt: new Date(due) };
}
