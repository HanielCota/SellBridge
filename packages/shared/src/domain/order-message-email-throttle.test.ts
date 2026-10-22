import { describe, expect, it } from "vitest";
import {
  ORDER_MESSAGE_EMAIL_WINDOW_MINUTES,
  planOrderMessageEmail,
  type OrderMessageAuthor,
  type OrderMessageMoment,
} from "./order-message-email-throttle.ts";

const MINUTE = 60_000;
const START = new Date("2026-10-22T13:00:00Z").getTime();

function at(minute: number): Date {
  return new Date(START + minute * MINUTE);
}

/**
 * Plays a conversation the way the app does: each message is planned when saved, and each
 * scheduled follow-up is planned again when its time comes. Returns the minutes the store's
 * messages were e-mailed to the supplier.
 */
function emailMinutes(store: readonly number[], supplier: readonly number[] = []): number[] {
  const messages: OrderMessageMoment[] = [
    ...store.map((minute) => ({ at: at(minute), author: "reseller" as OrderMessageAuthor })),
    ...supplier.map((minute) => ({ at: at(minute), author: "supplier" as OrderMessageAuthor })),
  ];
  const sent: number[] = [];
  const followUps = new Set<number>();
  const moments = [...new Set([...store, ...supplier])].toSorted((left, right) => left - right);
  const last = Math.max(...moments) + 2 * ORDER_MESSAGE_EMAIL_WINDOW_MINUTES;
  for (let minute = 0; minute <= last; minute += 0.1) {
    const now = Math.round(minute * 10) / 10;
    const due = [...followUps].filter((followUp) => followUp <= now);
    for (const followUp of due) {
      followUps.delete(followUp);
      const plan = planOrderMessageEmail({
        messages,
        author: "reseller",
        trigger: "follow_up",
        now: at(followUp),
      });
      if (plan.sendNow) sent.push(followUp);
    }
    for (const written of store.filter((storeMinute) => storeMinute === now)) {
      const plan = planOrderMessageEmail({
        messages,
        author: "reseller",
        trigger: "message",
        now: at(written),
      });
      if (plan.sendNow) sent.push(written);
      if (plan.followUpAt !== null) followUps.add((plan.followUpAt.getTime() - START) / MINUTE);
    }
  }
  return [...new Set(sent)];
}

describe("planOrderMessageEmail", () => {
  it("sends one e-mail for three messages within a minute, then the waiting one at the window's end", () => {
    expect(emailMinutes([0, 0.3, 0.8])).toEqual([0, 15]);
  });

  it("never loses the last message of a short burst", () => {
    // 10:00 "Oi" and 10:05 "O cliente pediu para trocar o endereço.", then nothing.
    expect(emailMinutes([0, 5])).toEqual([0, 15]);
  });

  it("keeps a steady conversation reaching the supplier, at most once per window", () => {
    const sent = emailMinutes([0, 10, 20, 30, 40, 50, 60]);
    expect(sent.length).toBeGreaterThanOrEqual(4);
    const gaps = sent.slice(1).map((minute, index) => minute - (sent[index] ?? minute));
    expect(gaps.every((gap) => gap >= ORDER_MESSAGE_EMAIL_WINDOW_MINUTES)).toBe(true);
  });

  it("e-mails again right away once the window passed", () => {
    expect(emailMinutes([0, 20])).toEqual([0, 20]);
  });

  it("drops the waiting e-mail when the other side answered in the conversation", () => {
    expect(emailMinutes([0, 5], [8])).toEqual([0]);
  });

  it("sends a single e-mail for two messages saved in the same instant", () => {
    // Indistinguishable in time, so neither opens a window alone: one e-mail, at its end.
    expect(emailMinutes([0, 0])).toEqual([15]);
  });

  it("does nothing before the author wrote", () => {
    expect(
      planOrderMessageEmail({ messages: [], author: "reseller", trigger: "message", now: at(0) }),
    ).toEqual({ sendNow: false, followUpAt: null });
  });
});
