import { describe, expect, it } from "vitest";
import {
  itemsToReachShare,
  levelAgainstTarget,
  overallLevel,
  ratingsToReachAverage,
} from "./health.ts";
import { resolvePeriod } from "../period-range.ts";
import { buildSupportPerformanceReport, type SupportReportPeriod } from "./report.ts";
import type {
  HealthMetricKey,
  OpenedTicketRow,
  QueueRow,
  RatingRow,
  ResolutionRow,
  SupportPerformanceRows,
} from "./types.ts";

const NOW = new Date("2026-10-24T15:00:00Z");
const DAY = 86_400_000;

function periodOf(preset: "today" | "7d" | "30d" | "90d"): SupportReportPeriod {
  return { preset, ...resolvePeriod({ period: preset }, NOW) };
}
const HOUR = 3_600_000;

function daysAgo(days: number, hours = 0): Date {
  return new Date(NOW.getTime() - days * DAY - hours * HOUR);
}

const SUBJECT = { origin: "seller", category: "order", situationId: "order-late" } as const;

function opened(overrides: Partial<OpenedTicketRow> = {}): OpenedTicketRow {
  return {
    ticketId: crypto.randomUUID(),
    tenantId: "tenant-a",
    ...SUBJECT,
    priority: "normal",
    createdAt: daysAgo(2),
    firstResponseAt: daysAgo(2, -1),
    firstResponderId: "ana",
    ...overrides,
  };
}

function resolution(overrides: Partial<ResolutionRow> = {}): ResolutionRow {
  return {
    ticketId: crypto.randomUUID(),
    ...SUBJECT,
    openedAt: daysAgo(11),
    closedAt: daysAgo(10),
    resolverId: "ana",
    cameBack: false,
    ...overrides,
  };
}

function rating(score: number, ratedAt = daysAgo(1)): RatingRow {
  return {
    ticketId: crypto.randomUUID(),
    ...SUBJECT,
    ratedAt,
    rating: score,
    comment: null,
    resolverId: "ana",
    ratedCloseAt: daysAgo(10),
  };
}

function queued(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    ticketId: crypto.randomUUID(),
    ...SUBJECT,
    assigneeId: "ana",
    awaitingSince: daysAgo(0, 1),
    overdue: false,
    ...overrides,
  };
}

function health(rows: Partial<SupportPerformanceRows>) {
  return buildSupportPerformanceReport({
    rows: { opened: [], resolutions: [], ratings: [], replies: [], queue: [], staff: [], ...rows },
    now: NOW,
    period: periodOf("30d"),
    origin: "todos",
  }).health;
}

function metric(result: ReturnType<typeof health>, key: HealthMetricKey) {
  const found = result.metrics.find((item) => item.key === key);
  if (found === undefined) {
    throw new Error(`metric ${key} missing`);
  }
  return found;
}

describe("support health against targets", () => {
  it("reads a share below its target as a warning first, then off target", () => {
    expect(levelAgainstTarget({ value: 0.92, sample: 10 }, 0.9, 0.05)).toBe("on_target");
    expect(levelAgainstTarget({ value: 0.86, sample: 10 }, 0.9, 0.05)).toBe("warning");
    expect(levelAgainstTarget({ value: 0.8, sample: 10 }, 0.9, 0.05)).toBe("off_target");
  });

  it("does not judge a metric measured on fewer than five tickets", () => {
    expect(levelAgainstTarget({ value: 0, sample: 4 }, 0.9, 0.05)).toBe("insufficient");
  });

  it("counts how many more good tickets bring a share back to the target", () => {
    expect(itemsToReachShare({ value: 0.84, sample: 100 }, 0.9)).toBe(60);
    expect(itemsToReachShare({ value: 0.95, sample: 100 }, 0.9)).toBeNull();
  });

  it("counts how many five-star ratings bring the average back to the target", () => {
    expect(ratingsToReachAverage({ value: 4, sample: 10 }, 4.5)).toBe(10);
    expect(ratingsToReachAverage({ value: 4.6, sample: 10 }, 4.5)).toBeNull();
  });

  it("puts the worst measured level on top and ignores the unmeasured ones", () => {
    expect(overallLevel(["on_target", "insufficient", "warning"])).toBe("warning");
    expect(overallLevel(["insufficient", "insufficient"])).toBe("insufficient");
  });

  it("lists the late first responses newest first, unanswered past due included", () => {
    const rows = [
      ...Array.from({ length: 4 }, () => opened()),
      opened({ ticketId: "late-old", createdAt: daysAgo(6), firstResponseAt: daysAgo(3) }),
      opened({ ticketId: "late-new", createdAt: daysAgo(3), firstResponseAt: null }),
    ];
    const onTime = metric(health({ opened: rows }), "on_time");
    expect(onTime.current).toBeCloseTo(4 / 6);
    expect(onTime.level).toBe("off_target");
    expect(onTime.drillDownTotal).toBe(2);
    expect(onTime.drillDown.map((item) => item.ticketId)).toEqual(["late-new", "late-old"]);
    expect(onTime.drillDown[0]?.detail).toEqual({ kind: "unanswered" });
  });

  it("flags the queue only above the allowed overdue tickets, longest wait first", () => {
    const queue = [
      queued({ ticketId: "a", overdue: true, awaitingSince: daysAgo(0, 3) }),
      queued({ ticketId: "b", overdue: true, awaitingSince: daysAgo(0, 9) }),
      queued({ ticketId: "c", overdue: true, awaitingSince: daysAgo(0, 5) }),
      queued(),
    ];
    const overdue = metric(health({ queue }), "overdue_now");
    expect(overdue.level).toBe("off_target");
    expect(overdue.toTarget).toBe(1);
    expect(overdue.drillDown.map((item) => item.ticketId)).toEqual(["b", "c", "a"]);
    expect(overdue.drillDown[0]?.detail).toEqual({ kind: "waiting", minutes: 540 });
    expect(metric(health({ queue: queue.slice(1) }), "overdue_now").level).toBe("on_target");
  });

  it("shows only three tickets behind a metric and keeps the full count", () => {
    const rows = Array.from({ length: 6 }, (_, index) =>
      resolution({ cameBack: true, closedAt: daysAgo(10 + index) }),
    );
    const noReopen = metric(health({ resolutions: rows }), "no_reopen");
    expect(noReopen.drillDown).toHaveLength(3);
    expect(noReopen.drillDownTotal).toBe(6);
  });

  it("counts the period's ratings by stars and lists the low ones", () => {
    const result = health({ ratings: [rating(5), rating(5), rating(2), rating(4), rating(1)] });
    expect(result.ratingCounts).toEqual([1, 1, 0, 1, 2]);
    expect(metric(result, "rating").drillDown.map((item) => item.detail)).toEqual([
      { kind: "rating", rating: 2 },
      { kind: "rating", rating: 1 },
    ]);
  });
});
