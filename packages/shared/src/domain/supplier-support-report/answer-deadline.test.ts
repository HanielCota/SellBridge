import { describe, expect, it } from "vitest";
import { answerDeadline } from "./answer-deadline.ts";

describe("answerDeadline", () => {
  it("gives a Monday message until Tuesday ends, in Brasília", () => {
    const mondayMorning = new Date("2026-11-16T10:00:00-03:00");

    const deadline = answerDeadline(mondayMorning);

    expect(deadline.toISOString()).toBe("2026-11-18T03:00:00.000Z");
  });

  it("gives a Friday afternoon message until Monday ends", () => {
    const fridayAfternoon = new Date("2026-11-20T15:00:00-03:00");

    const deadline = answerDeadline(fridayAfternoon);

    expect(deadline.toISOString()).toBe("2026-11-24T03:00:00.000Z");
  });

  it("gives a Saturday message until Monday ends", () => {
    const saturday = new Date("2026-11-21T11:00:00-03:00");

    const deadline = answerDeadline(saturday);

    expect(deadline.toISOString()).toBe("2026-11-24T03:00:00.000Z");
  });

  it("reads the day on the Brasília clock, not in UTC", () => {
    // 23:30 on Monday in Brasília is already Tuesday in UTC.
    const mondayNight = new Date("2026-11-16T23:30:00-03:00");

    const deadline = answerDeadline(mondayNight);

    expect(deadline.toISOString()).toBe("2026-11-18T03:00:00.000Z");
  });

  it("throws a validation error for an invalid date", () => {
    expect(() => answerDeadline(new Date("not a date"))).toThrow("Invalid date");
  });
});
