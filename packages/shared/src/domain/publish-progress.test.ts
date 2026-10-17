import { describe, expect, it } from "vitest";
import { estimatePublishProgress } from "./publish-progress.ts";

const startedAt = new Date("2026-10-16T12:00:00Z");

function after(seconds: number): Date {
  return new Date(startedAt.getTime() + seconds * 1000);
}

describe("estimatePublishProgress", () => {
  it("has no estimate before the first job finishes", () => {
    expect(
      estimatePublishProgress({ total: 40, finished: 0, startedAt, lastFinishedAt: null }),
    ).toEqual({ done: 0, total: 40, percent: 0, remainingMilliseconds: null });
  });

  it("estimates the rest by the average pace of the finished jobs", () => {
    // 10 jobs in 30 s: one every 3 s, 30 left → 90 s.
    expect(
      estimatePublishProgress({ total: 40, finished: 10, startedAt, lastFinishedAt: after(30) }),
    ).toEqual({ done: 10, total: 40, percent: 25, remainingMilliseconds: 90_000 });
  });

  it("never shows 100% while a job is still running", () => {
    const progress = estimatePublishProgress({
      total: 200,
      finished: 199,
      startedAt,
      lastFinishedAt: after(199),
    });
    expect(progress.percent).toBe(99);
    expect(progress.remainingMilliseconds).toBe(1000);
  });

  it("ends at 100% with nothing left", () => {
    expect(
      estimatePublishProgress({ total: 3, finished: 3, startedAt, lastFinishedAt: after(9) }),
    ).toEqual({ done: 3, total: 3, percent: 100, remainingMilliseconds: 0 });
  });

  it("treats an empty batch as done", () => {
    expect(
      estimatePublishProgress({ total: 0, finished: 0, startedAt: null, lastFinishedAt: null }),
    ).toEqual({ done: 0, total: 0, percent: 100, remainingMilliseconds: 0 });
  });

  it("has no estimate when the dates are missing", () => {
    expect(
      estimatePublishProgress({ total: 4, finished: 1, startedAt: null, lastFinishedAt: null })
        .remainingMilliseconds,
    ).toBeNull();
  });
});
