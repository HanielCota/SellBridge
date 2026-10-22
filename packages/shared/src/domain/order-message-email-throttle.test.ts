import { describe, expect, it } from "vitest";
import {
  ORDER_MESSAGE_EMAIL_WINDOW_MINUTES,
  shouldEmailOrderMessage,
} from "./order-message-email-throttle.ts";

const MINUTE = 60_000;
const START = new Date("2026-10-22T15:00:00Z");

function at(minutes: number): Date {
  return new Date(START.getTime() + minutes * MINUTE);
}

/** Which of the author's messages, sent at these minutes, get an e-mail. */
function emailed(minutes: readonly number[]): number[] {
  return minutes.filter((minute, index) => {
    const previous = index === 0 ? null : at(minutes[index - 1] ?? 0);
    return shouldEmailOrderMessage({ previousMessageAt: previous, now: at(minute) });
  });
}

describe("shouldEmailOrderMessage", () => {
  it("sends one e-mail for three messages within a minute", () => {
    expect(emailed([0, 0.3, 0.8])).toEqual([0]);
  });

  it("sends another e-mail once the author was quiet for the whole window", () => {
    expect(emailed([0, 0.5, 0.5 + ORDER_MESSAGE_EMAIL_WINDOW_MINUTES])).toEqual([0, 15.5]);
  });

  it("keeps quiet one minute before the window ends", () => {
    expect(emailed([0, ORDER_MESSAGE_EMAIL_WINDOW_MINUTES - 1])).toEqual([0]);
  });

  it("e-mails the first message of a parcel", () => {
    expect(shouldEmailOrderMessage({ previousMessageAt: null, now: START })).toBe(true);
  });
});
