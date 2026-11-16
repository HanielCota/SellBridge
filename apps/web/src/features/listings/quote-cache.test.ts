import { describe, expect, it, vi } from "vitest";
import { QUOTE_FALLBACK_MILLISECONDS, QUOTE_FRESH_MILLISECONDS, readQuotes } from "./quote-cache";

const now = new Date("2026-11-16T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

describe("readQuotes", () => {
  it("uses a saved answer younger than a day without asking", async () => {
    const ask = vi.fn<(quoteKey: string) => Promise<number>>(async () => 999);
    const saved = new Map([["commission:MLB1", { amount: 1_400, readAt: hoursAgo(23) }]]);

    const reading = await readQuotes({ quoteKeys: ["commission:MLB1"], saved, now, ask });

    expect(ask).not.toHaveBeenCalled();
    expect(reading.quotes.get("commission:MLB1")?.amount).toBe(1_400);
    expect(reading.asked).toEqual([]);
  });

  it("asks again after a day and keeps the new answer to save", async () => {
    const ask = vi.fn<(quoteKey: string) => Promise<number>>(async () => 1_250);
    const saved = new Map([["commission:MLB1", { amount: 1_400, readAt: hoursAgo(24) }]]);

    const reading = await readQuotes({ quoteKeys: ["commission:MLB1"], saved, now, ask });

    expect(ask).toHaveBeenCalledWith("commission:MLB1");
    expect(reading.quotes.get("commission:MLB1")).toEqual({ amount: 1_250, readAt: now });
    expect(reading.asked).toEqual([{ quoteKey: "commission:MLB1", amount: 1_250, readAt: now }]);
  });

  it("asks for a key never asked before", async () => {
    const reading = await readQuotes({
      quoteKeys: ["shipping:a"],
      saved: new Map(),
      now,
      ask: async () => 685,
    });

    expect(reading.quotes.get("shipping:a")?.amount).toBe(685);
  });

  it("falls back to an answer up to a week old when the marketplace does not answer", async () => {
    const saved = new Map([["shipping:a", { amount: 685, readAt: hoursAgo(6 * 24) }]]);

    const reading = await readQuotes({
      quoteKeys: ["shipping:a"],
      saved,
      now,
      ask: async () => {
        throw new Error("timeout");
      },
    });

    expect(reading.quotes.get("shipping:a")).toEqual(saved.get("shipping:a"));
    expect(reading.asked).toEqual([]);
    expect(reading.missing).toEqual([]);
  });

  it("gives up on an answer a week old or more when the marketplace does not answer", async () => {
    const saved = new Map([["shipping:a", { amount: 685, readAt: hoursAgo(7 * 24) }]]);

    const reading = await readQuotes({
      quoteKeys: ["shipping:a"],
      saved,
      now,
      ask: async () => {
        throw new Error("timeout");
      },
    });

    expect(reading.quotes.has("shipping:a")).toBe(false);
    expect(reading.missing).toEqual(["shipping:a"]);
  });

  it("is missing a key never answered when the marketplace does not answer", async () => {
    const reading = await readQuotes({
      quoteKeys: ["shipping:a"],
      saved: new Map(),
      now,
      ask: async () => {
        throw new Error("401");
      },
    });

    expect(reading.missing).toEqual(["shipping:a"]);
  });

  it("asks only the stale keys, all at once, and keeps the fresh ones", async () => {
    const ask = vi.fn<(quoteKey: string) => Promise<number>>(async (key: string) =>
      key === "b" ? 20 : 30,
    );
    const saved = new Map([
      ["a", { amount: 10, readAt: hoursAgo(1) }],
      ["b", { amount: 2, readAt: hoursAgo(30) }],
    ]);

    const reading = await readQuotes({ quoteKeys: ["a", "b", "c"], saved, now, ask });

    expect(ask.mock.calls.map(([key]) => key)).toEqual(["b", "c"]);
    expect([...reading.quotes].map(([key, quote]) => [key, quote.amount])).toEqual([
      ["a", 10],
      ["b", 20],
      ["c", 30],
    ]);
  });

  it("keeps the windows at one day and one week", () => {
    expect(QUOTE_FRESH_MILLISECONDS).toBe(86_400_000);
    expect(QUOTE_FALLBACK_MILLISECONDS).toBe(604_800_000);
  });
});
