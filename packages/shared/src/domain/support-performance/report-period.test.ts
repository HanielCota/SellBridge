import { describe, expect, it } from "vitest";
import { resolvePeriod } from "../period-range.ts";
import { buildSupportPerformanceReport, type SupportReportPeriod } from "./report.ts";
import type { OpenedTicketRow, RatingRow, ResolutionRow, SupportPerformanceRows } from "./types.ts";

// Saturday 2026-10-24, 15:00 UTC = 12:00 in Brasília.
const NOW = new Date("2026-10-24T15:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR);
}

const SUBJECT = { origin: "seller", category: "order", situationId: "order-late" } as const;

function opened(overrides: Partial<OpenedTicketRow> = {}): OpenedTicketRow {
  return {
    ticketId: crypto.randomUUID(),
    tenantId: "tenant-a",
    ...SUBJECT,
    priority: "normal",
    createdAt: hoursAgo(2),
    firstResponseAt: hoursAgo(1),
    firstResponderId: "ana",
    ...overrides,
  };
}

function resolution(overrides: Partial<ResolutionRow> = {}): ResolutionRow {
  return {
    ticketId: crypto.randomUUID(),
    ...SUBJECT,
    openedAt: hoursAgo(5),
    closedAt: hoursAgo(1),
    resolverId: "ana",
    cameBack: false,
    ...overrides,
  };
}

function rating(score: number, ratedAt: Date): RatingRow {
  return {
    ticketId: crypto.randomUUID(),
    ...SUBJECT,
    ratedAt,
    rating: score,
    comment: null,
    resolverId: "ana",
    ratedCloseAt: hoursAgo(3),
  };
}

function rows(overrides: Partial<SupportPerformanceRows>): SupportPerformanceRows {
  return {
    opened: [],
    resolutions: [],
    ratings: [],
    replies: [],
    queue: [],
    staff: [{ id: "ana", name: "Ana", role: "agent", joinedAt: new Date(0), banned: false }],
    ...overrides,
  };
}

function report(
  overrides: Partial<SupportPerformanceRows>,
  search: { period: "today" | "7d" | "custom"; from?: string; to?: string },
) {
  const resolved = resolvePeriod(search, NOW);
  const period: SupportReportPeriod = { preset: search.period, ...resolved };
  return buildSupportPerformanceReport({
    rows: rows(overrides),
    now: NOW,
    period,
    origin: "todos",
  });
}

describe("support report periods", () => {
  it("reads today hour by hour, up to the current hour", () => {
    const result = report({ opened: [opened({ createdAt: hoursAgo(2) })] }, { period: "today" });
    expect(result.bucket).toBe("hour");
    // 12:00 in Brasília: midnight to noon is 13 hourly buckets.
    expect(result.series).toHaveLength(13);
    expect(result.series.at(-1)?.start).toBe("2026-10-24T12");
    expect(result.series.find((point) => point.start === "2026-10-24T10")?.opened).toBe(1);
  });

  it("leaves tickets after a past custom range out of it", () => {
    const result = report(
      { opened: [opened({ createdAt: hoursAgo(2) }), opened({ createdAt: hoursAgo(80) })] },
      { period: "custom", from: "2026-10-20", to: "2026-10-21" },
    );
    expect(result.period).toEqual({
      preset: "custom",
      fromDate: "2026-10-20",
      toDate: "2026-10-21",
      days: 2,
    });
    expect(result.overview.opened.current).toBe(1);
  });

  it("puts the previous period's tickets in the matching bucket for comparison", () => {
    const result = report(
      { opened: [opened({ createdAt: new Date(hoursAgo(2).getTime() - 7 * DAY) })] },
      { period: "7d" },
    );
    expect(result.series.at(-1)?.previousOpened).toBe(1);
    expect(result.series.reduce((sum, point) => sum + point.opened, 0)).toBe(0);
  });

  it("builds the day panel only for a single day, with its timeline newest first", () => {
    const day = report(
      {
        opened: [opened({ ticketId: "new", createdAt: hoursAgo(1) })],
        resolutions: [resolution({ ticketId: "done", closedAt: hoursAgo(2) })],
        ratings: [rating(2, hoursAgo(3))],
      },
      { period: "today" },
    );
    expect(day.today?.isToday).toBe(true);
    expect(day.today?.events.map((event) => event.kind)).toEqual(["opened", "resolved", "rated"]);
    expect(report({}, { period: "7d" }).today).toBeNull();
  });

  it("gives every heatmap cell its wait, its top subject and its latest tickets", () => {
    const result = report(
      {
        opened: [
          opened({ ticketId: "a", createdAt: hoursAgo(2), firstResponseAt: hoursAgo(1) }),
          opened({ ticketId: "b", createdAt: hoursAgo(2), firstResponseAt: null }),
        ],
      },
      { period: "7d" },
    );
    // Saturday (5) at 10h in Brasília.
    const cell = result.heatmap.find((item) => item.weekday === 5 && item.hour === 10);
    expect(cell?.opened).toBe(2);
    expect(cell?.firstResponseMinutes).toBe(60);
    expect(cell?.topSubject).toEqual(SUBJECT);
    expect(cell?.recent.map((ticket) => ticket.status).toSorted()).toEqual([
      "answered_on_time",
      "waiting",
    ]);
  });
});
