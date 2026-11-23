import { describe, expect, it } from "vitest";
import {
  cutoffPostingDay,
  DEFAULT_CUTOFF_MINUTES,
  dispatchCutoffSettingsSchema,
  formatCutoffTime,
} from "./dispatch-cutoff.ts";

const MERCADO_LIVRE = DEFAULT_CUTOFF_MINUTES.mercado_livre;

describe("cutoffPostingDay", () => {
  it("posts the same business day for a sale before the cutoff", () => {
    const tuesdayMorning = new Date("2026-11-17T10:00:00-03:00");

    expect(cutoffPostingDay(tuesdayMorning, MERCADO_LIVRE)).toBe("2026-11-17");
  });

  it("posts the next business day for a sale after the cutoff", () => {
    const tuesdayAfternoon = new Date("2026-11-17T15:00:00-03:00");

    expect(cutoffPostingDay(tuesdayAfternoon, MERCADO_LIVRE)).toBe("2026-11-18");
  });

  it("counts a sale exactly at the cutoff as after it", () => {
    const tuesdayAtCutoff = new Date("2026-11-17T14:30:00-03:00");

    expect(cutoffPostingDay(tuesdayAtCutoff, MERCADO_LIVRE)).toBe("2026-11-18");
  });

  it("counts one minute before the cutoff as the same day", () => {
    const tuesdayBeforeCutoff = new Date("2026-11-17T14:29:59-03:00");

    expect(cutoffPostingDay(tuesdayBeforeCutoff, MERCADO_LIVRE)).toBe("2026-11-17");
  });

  it("reads the time in Brasília, not in UTC", () => {
    const thursdayNightInBrasilia = new Date("2026-11-19T02:00:00Z");

    expect(cutoffPostingDay(thursdayNightInBrasilia, MERCADO_LIVRE)).toBe("2026-11-19");
  });

  it("skips a holiday and the weekend after a Thursday sale past the cutoff", () => {
    const thursdayAfternoon = new Date("2026-11-19T16:00:00-03:00");

    expect(cutoffPostingDay(thursdayAfternoon, MERCADO_LIVRE)).toBe("2026-11-23");
  });

  it("moves a Saturday morning sale to Monday", () => {
    const saturdayMorning = new Date("2026-11-28T09:00:00-03:00");

    expect(cutoffPostingDay(saturdayMorning, DEFAULT_CUTOFF_MINUTES.shopee)).toBe("2026-11-30");
  });

  it("throws for a cutoff outside the day", () => {
    const tuesday = new Date("2026-11-17T10:00:00-03:00");

    expect(() => cutoffPostingDay(tuesday, 1440)).toThrow("expected an integer from 0 to 1439");
    expect(() => cutoffPostingDay(tuesday, -1)).toThrow("expected an integer from 0 to 1439");
    expect(() => cutoffPostingDay(tuesday, Number.NaN)).toThrow("Invalid cutoff");
  });

  it("throws for an invalid date", () => {
    expect(() => cutoffPostingDay(new Date("nope"), MERCADO_LIVRE)).toThrow("Invalid date");
  });
});

describe("formatCutoffTime", () => {
  it("writes hours and minutes with two digits", () => {
    expect(formatCutoffTime(870)).toBe("14:30");
    expect(formatCutoffTime(0)).toBe("00:00");
    expect(formatCutoffTime(1439)).toBe("23:59");
  });
});

describe("dispatchCutoffSettingsSchema", () => {
  it("turns each typed time into minutes", () => {
    const parsed = dispatchCutoffSettingsSchema.parse({
      enabled: true,
      mercadoLivre: "14:30",
      shopee: " 13:00 ",
      tiktokShop: "18:00",
    });

    expect(parsed).toEqual({ enabled: true, mercadoLivre: 870, shopee: 780, tiktokShop: 1080 });
  });

  it("refuses a time outside the day with how to write it", () => {
    const result = dispatchCutoffSettingsSchema.safeParse({
      enabled: true,
      mercadoLivre: "24:00",
      shopee: "13:00",
      tiktokShop: "18h",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Escreva a hora como 14:30, de 00:00 a 23:59",
      "Escreva a hora como 14:30, de 00:00 a 23:59",
    ]);
  });
});
