import { describe, expect, it } from "vitest";
import {
  ORDER_MESSAGE_EMAIL_WINDOW_MINUTES,
  shouldEmailLatestOrderMessage,
} from "./order-message-email-throttle.ts";

const MINUTE = 60_000;
const START = new Date("2026-10-22T15:00:00Z");

function at(minutes: number): Date {
  return new Date(START.getTime() + minutes * MINUTE);
}

/** Which of the author's messages, sent at these minutes, get an e-mail as each one arrives. */
function emailed(minutes: readonly number[]): number[] {
  return minutes.filter((_, index) =>
    shouldEmailLatestOrderMessage(minutes.slice(0, index + 1).map(at)),
  );
}

describe("shouldEmailLatestOrderMessage", () => {
  it("sends one e-mail for three messages within a minute", () => {
    expect(emailed([0, 0.3, 0.8])).toEqual([0]);
  });

  it("sends another e-mail once the author was quiet for the whole window", () => {
    expect(emailed([0, 0.5, 0.5 + ORDER_MESSAGE_EMAIL_WINDOW_MINUTES])).toEqual([0, 15.5]);
  });

  it("keeps quiet one minute before the window ends", () => {
    expect(emailed([0, ORDER_MESSAGE_EMAIL_WINDOW_MINUTES - 1])).toEqual([0]);
  });

  it("keeps e-mailing a steady conversation, never twice within a window", () => {
    const everyTenMinutes = [0, 10, 20, 30, 40, 50, 60];
    const sent = emailed(everyTenMinutes);
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(sent.length).toBeLessThanOrEqual(5);
    const gaps = sent.slice(1).map((minute, index) => minute - (sent[index] ?? minute));
    expect(gaps.every((gap) => gap >= ORDER_MESSAGE_EMAIL_WINDOW_MINUTES)).toBe(true);
  });

  it("sends one e-mail for two messages written in the same instant", () => {
    expect(emailed([0, 0])).toEqual([0]);
  });

  it("e-mails the first message of a parcel", () => {
    expect(shouldEmailLatestOrderMessage([START])).toBe(true);
    expect(shouldEmailLatestOrderMessage([])).toBe(false);
  });
});
