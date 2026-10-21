import { describe, expect, it } from "vitest";
import { canRetryTarget, pauseTransition } from "./listing-rules.ts";

describe("retry rules", () => {
  it("only lets failed publications go back to the queue", () => {
    expect(canRetryTarget("error")).toBe(true);
    expect(canRetryTarget("published")).toBe(false);
  });
});

describe("pauseTransition", () => {
  it("pauses live publications and resumes paused ones", () => {
    expect(pauseTransition(true)).toEqual({ from: "published", to: "paused" });
    expect(pauseTransition(false)).toEqual({ from: "paused", to: "published" });
  });
});
