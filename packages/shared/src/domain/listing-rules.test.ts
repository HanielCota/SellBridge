import { describe, expect, it } from "vitest";
import { hasErrorCode } from "../runtime/errors.ts";
import {
  assertCanRetryTarget,
  assertSellablePrice,
  canRetryTarget,
  pauseTransition,
} from "./listing-rules.ts";

function thrownBy(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return null;
}

describe("assertSellablePrice", () => {
  it("accepts a price above the supplier cost", () => {
    expect(() => assertSellablePrice(1001, 1000)).not.toThrow();
  });

  it("rejects a price equal to or below the cost as a conflict", () => {
    const error = thrownBy(() => assertSellablePrice(1000, 1000));
    expect(hasErrorCode(error, "CONFLICT")).toBe(true);
    expect(() => assertSellablePrice(900, 1000)).toThrow(/maior que o custo/);
  });
});

describe("retry rules", () => {
  it("only lets failed publications go back to the queue", () => {
    expect(canRetryTarget("error")).toBe(true);
    expect(canRetryTarget("published")).toBe(false);
    expect(() => assertCanRetryTarget("error")).not.toThrow();
    const error = thrownBy(() => assertCanRetryTarget("pending"));
    expect(hasErrorCode(error, "CONFLICT")).toBe(true);
  });
});

describe("pauseTransition", () => {
  it("pauses live publications and resumes paused ones", () => {
    expect(pauseTransition(true)).toEqual({ from: "published", to: "paused" });
    expect(pauseTransition(false)).toEqual({ from: "paused", to: "published" });
  });
});
