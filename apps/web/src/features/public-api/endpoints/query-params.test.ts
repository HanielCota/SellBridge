import { describe, expect, it } from "vitest";
import { queryBooleanSchema, resolveApiPeriod } from "./query-params";

// 15:00 UTC is noon in Brasília, so "today" is 2026-03-10 there too.
const now = new Date("2026-03-10T15:00:00Z");

describe("queryBooleanSchema", () => {
  it("reads only the words true and false", () => {
    expect(queryBooleanSchema.parse("true")).toBe(true);
    expect(queryBooleanSchema.parse("false")).toBe(false);
    expect(queryBooleanSchema.safeParse("1").success).toBe(false);
  });
});

describe("resolveApiPeriod", () => {
  it("defaults to the last 30 days ending today", () => {
    const { search, period } = resolveApiPeriod({}, now);
    expect(search).toEqual({ period: "30d" });
    expect(period).toMatchObject({ fromDate: "2026-02-09", toDate: "2026-03-10", days: 30 });
  });

  it("uses the exact range asked for", () => {
    const { search, period } = resolveApiPeriod({ from: "2026-03-01", to: "2026-03-07" }, now);
    expect(search).toEqual({ period: "custom", from: "2026-03-01", to: "2026-03-07" });
    expect(period).toMatchObject({ fromDate: "2026-03-01", toDate: "2026-03-07", days: 7 });
  });

  it("rejects a range with only one end", () => {
    expect(() => resolveApiPeriod({ from: "2026-03-01" }, now)).toThrow(/juntos/);
  });

  it("rejects ranges the reports would silently replace", () => {
    expect(() => resolveApiPeriod({ from: "2026-03-07", to: "2026-03-01" }, now)).toThrow(
      /Período inválido/,
    );
    expect(() => resolveApiPeriod({ from: "2026-02-30", to: "2026-03-01" }, now)).toThrow(
      /Período inválido/,
    );
    expect(() => resolveApiPeriod({ from: "2024-01-01", to: "2026-03-01" }, now)).toThrow(
      /Período inválido/,
    );
  });
});
