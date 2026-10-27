import { describe, expect, it } from "vitest";
import { resolvePeriod } from "../period-range.ts";
import { buildSupportPerformanceReport, type SupportReportPeriod } from "./report.ts";
import { agentStanding, expectedRate, median } from "./rules.ts";
import type {
  OpenedTicketRow,
  QueueRow,
  RatingRow,
  ResolutionRow,
  StaffRow,
  SupportPerformanceRows,
} from "./types.ts";

const NOW = new Date("2026-10-24T15:00:00Z");
const DAY = 86_400_000;

function periodOf(preset: "today" | "7d" | "30d" | "90d"): SupportReportPeriod {
  return { preset, ...resolvePeriod({ period: preset }, NOW) };
}

function daysAgo(days: number, hours = 0): Date {
  return new Date(NOW.getTime() - days * DAY - hours * 3_600_000);
}

function opened(overrides: Partial<OpenedTicketRow> = {}): OpenedTicketRow {
  return {
    ticketId: crypto.randomUUID(),
    tenantId: "tenant-a",
    origin: "seller",
    category: "order",
    situationId: "order-late",
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
    origin: "seller",
    category: "order",
    situationId: "order-late",
    openedAt: daysAgo(11),
    closedAt: daysAgo(10),
    resolverId: "ana",
    cameBack: false,
    ...overrides,
  };
}

function rating(overrides: Partial<RatingRow> = {}): RatingRow {
  return {
    ticketId: crypto.randomUUID(),
    origin: "seller",
    category: "order",
    situationId: "order-late",
    ratedAt: daysAgo(1),
    rating: 5,
    comment: null,
    resolverId: "ana",
    ratedCloseAt: daysAgo(10),
    ...overrides,
  };
}

const STAFF: StaffRow[] = [
  { id: "ana", name: "Ana", role: "supervisor", joinedAt: daysAgo(300), banned: false },
  { id: "bia", name: "Bia", role: "agent", joinedAt: daysAgo(20), banned: false },
];

function rowsWith(overrides: Partial<SupportPerformanceRows>): SupportPerformanceRows {
  return {
    opened: [],
    resolutions: [],
    ratings: [],
    replies: [],
    queue: [],
    staff: STAFF,
    ...overrides,
  };
}

function report(
  overrides: Partial<SupportPerformanceRows>,
  origin: "todos" | "revendedor" | "fornecedor" = "todos",
) {
  return buildSupportPerformanceReport({
    rows: rowsWith(overrides),
    now: NOW,
    period: periodOf("30d"),
    origin,
  });
}

function agent(result: ReturnType<typeof report>, id: string) {
  const found = result.team.find((member) => member.id === id);
  if (found === undefined) {
    throw new Error(`agent ${id} missing`);
  }
  return found;
}

describe("median", () => {
  it("keeps one slow outlier from dragging the middle value", () => {
    expect(median([10, 12, 14, 900])).toBe(13);
    expect(median([5])).toBe(5);
    expect(median([])).toBeNull();
  });
});

describe("expectedRate", () => {
  it("weights the team's rate on each subject by how many of them the person resolved", () => {
    const own = new Map([
      ["easy", 3],
      ["hard", 1],
    ]);
    const team = new Map([
      ["easy", 1],
      ["hard", 0.6],
    ]);
    expect(expectedRate(own, team)).toBeCloseTo(0.9);
  });
});

describe("agentStanding", () => {
  const base = {
    overdueNow: 0,
    resolved: 10,
    onTime: { value: 0.9, sample: 10 },
    noReopen: { value: 0.9, sample: 10 },
    expectedNoReopen: 0.9,
  };

  it("puts late tickets ahead of every comparison", () => {
    expect(agentStanding({ ...base, overdueNow: 1, resolved: 1 })).toBe("overdue");
  });

  it("does not judge someone with too few resolutions", () => {
    expect(agentStanding({ ...base, resolved: 4, onTime: { value: 0.1, sample: 4 } })).toBe(
      "too_few",
    );
  });

  it("asks for support when tickets come back more than the subject mix predicts", () => {
    expect(agentStanding({ ...base, noReopen: { value: 0.8, sample: 10 } })).toBe("needs_support");
  });

  it("keeps someone on par when hard subjects lower the rate as much as the team's", () => {
    expect(
      agentStanding({ ...base, noReopen: { value: 0.7, sample: 10 }, expectedNoReopen: 0.72 }),
    ).toBe("on_par");
  });
});

describe("buildSupportPerformanceReport", () => {
  it("credits each resolution to its resolver and compares with the previous period", () => {
    const result = report({
      resolutions: [
        resolution(),
        resolution({ resolverId: "bia" }),
        resolution({ closedAt: daysAgo(45), openedAt: daysAgo(46) }),
      ],
    });
    expect(result.overview.resolved).toEqual({ current: 2, previous: 1 });
    expect(agent(result, "ana").resolved).toEqual({ current: 1, previous: 1 });
    expect(agent(result, "bia").resolved).toEqual({ current: 1, previous: 0 });
  });

  it("counts a resolution that came back as not solved", () => {
    const result = report({
      resolutions: [resolution(), resolution({ cameBack: true })],
    });
    expect(result.overview.noReopen).toEqual({ value: 0.5, sample: 2 });
  });

  it("gives the rating to whoever resolved and reports how many customers rated", () => {
    const result = report({
      resolutions: [resolution(), resolution({ resolverId: "bia" })],
      ratings: [rating({ rating: 2, resolverId: "bia", comment: "Voltou o problema" })],
    });
    expect(agent(result, "bia").rating).toEqual({ value: 2, sample: 1 });
    expect(agent(result, "bia").lowRatings[0]?.comment).toBe("Voltou o problema");
    expect(agent(result, "ana").rating.sample).toBe(0);
    expect(result.overview.ratingRate).toBe(0.5);
  });

  it("measures the person's rate against the team on the same subjects", () => {
    const hard = { category: "store" as const, situationId: "store-disconnected" };
    const resolutions = [
      ...Array.from({ length: 5 }, () => resolution()),
      ...Array.from({ length: 3 }, () => resolution({ ...hard, resolverId: "bia" })),
      ...Array.from({ length: 2 }, () =>
        resolution({ ...hard, resolverId: "bia", cameBack: true }),
      ),
      ...Array.from({ length: 2 }, () => resolution({ ...hard, cameBack: true })),
      resolution({ ...hard }),
    ];
    const bia = agent(report({ resolutions }), "bia");
    // Bia only takes the hard subject, where the whole team keeps 4 of 8.
    expect(bia.noReopen.value).toBeCloseTo(0.6);
    expect(bia.expectedNoReopen).toBeCloseTo(0.5);
    expect(bia.standing).toBe("on_par");
  });

  it("counts active days on the Brasília calendar", () => {
    const result = report({
      replies: [
        // 01:30 UTC on the 23rd is still the 22nd in Brasília.
        { authorId: "ana", origin: "seller", createdAt: new Date("2026-10-23T01:30:00Z") },
        { authorId: "ana", origin: "seller", createdAt: new Date("2026-10-22T20:00:00Z") },
        { authorId: "ana", origin: "seller", createdAt: new Date("2026-10-23T14:00:00Z") },
      ],
    });
    expect(agent(result, "ana").activeDays).toBe(2);
  });

  it("marks support people who joined less than 90 days ago as on probation, never admins", () => {
    const result = report({
      staff: [
        ...STAFF,
        { id: "dono", name: "Dono", role: "admin", joinedAt: daysAgo(1), banned: false },
      ],
      replies: [{ authorId: "dono", origin: "seller", createdAt: daysAgo(1) }],
    });
    expect(agent(result, "bia").onProbation).toBe(true);
    expect(agent(result, "ana").onProbation).toBe(false);
    expect(agent(result, "dono").onProbation).toBe(false);
  });

  it("keeps only the chosen customers when an origin is picked", () => {
    const result = report(
      {
        opened: [opened(), opened({ origin: "supplier", category: "listing", situationId: null })],
      },
      "fornecedor",
    );
    expect(result.overview.opened.current).toBe(1);
    expect(result.subjects).toHaveLength(1);
    expect(result.subjects[0]?.origin).toBe("supplier");
  });

  it("flags a subject that rose sharply against the previous period", () => {
    const now = Array.from({ length: 5 }, () =>
      opened({ situationId: "store-disconnected", category: "store" }),
    );
    const before = [
      opened({ situationId: "store-disconnected", category: "store", createdAt: daysAgo(45) }),
    ];
    const result = report({ opened: [...now, ...before] });
    expect(result.attention).toContainEqual(
      expect.objectContaining({ kind: "rising_subject", current: 5, previous: 1 }),
    );
  });

  it("says when the form misses a situation because many pick 'Outro problema'", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => opened()),
      ...Array.from({ length: 2 }, () => opened({ situationId: "other-issue" })),
    ];
    expect(report({ opened: rows }).attention).toContainEqual(
      expect.objectContaining({ kind: "open_ended", category: "order", share: 0.4 }),
    );
  });

  it("lists late and unassigned tickets in the queue and the attention list", () => {
    const queue: QueueRow[] = [
      {
        ticketId: "t1",
        origin: "seller",
        category: "order",
        situationId: "order-late",
        assigneeId: "bia",
        awaitingSince: daysAgo(2),
        overdue: true,
      },
      {
        ticketId: "t2",
        origin: "seller",
        category: "order",
        situationId: "order-late",
        assigneeId: null,
        awaitingSince: daysAgo(0, 2),
        overdue: false,
      },
    ];
    const result = report({ queue });
    expect(result.queue).toEqual({ open: 2, waiting: 2, overdue: 1, unassigned: 1 });
    expect(agent(result, "bia").standing).toBe("overdue");
    expect(result.team[0]?.id).toBe("bia");
    expect(result.attention.map((item) => item.kind)).toEqual(["overdue", "unassigned"]);
  });

  it("measures the first response as a median and checks it against the priority's target", () => {
    const result = report({
      opened: [
        opened({ firstResponseAt: daysAgo(2, -1) }),
        opened({ firstResponseAt: daysAgo(2, -3) }),
        opened({ priority: "urgent", firstResponseAt: daysAgo(2, -5) }),
      ],
    });
    expect(result.overview.firstResponseMinutes.current).toBe(180);
    expect(result.overview.onTime).toEqual({ value: 2 / 3, sample: 3 });
  });

  it("uses the reports' buckets: day by day up to six weeks, week by week beyond", () => {
    const month = report({ resolutions: [resolution()] });
    expect(month.bucket).toBe("day");
    expect(month.series).toHaveLength(30);
    expect(month.series.reduce((sum, point) => sum + point.resolved, 0)).toBe(1);
    const quarter = buildSupportPerformanceReport({
      rows: rowsWith({ resolutions: [resolution()] }),
      now: NOW,
      period: periodOf("90d"),
      origin: "todos",
    });
    expect(quarter.bucket).toBe("week");
    expect(quarter.series.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.start))).toBe(true);
  });
});

describe("review findings (2026-10-25)", () => {
  it("does not let customers closing on their own raise the yardstick", () => {
    const resolutions = [
      ...Array.from({ length: 8 }, () => resolution()),
      ...Array.from({ length: 2 }, () => resolution({ cameBack: true })),
      ...Array.from({ length: 10 }, () => resolution({ resolverId: null })),
    ];
    const ana = agent(report({ resolutions }), "ana");
    expect(ana.expectedNoReopen).toBeCloseTo(0.8);
    expect(ana.standing).toBe("on_par");
  });

  it("does not flag someone over a single late first reply", () => {
    const result = report({
      resolutions: Array.from({ length: 9 }, () => resolution({ resolverId: "bia" })),
      opened: [
        opened({ priority: "urgent", firstResponderId: "bia", firstResponseAt: daysAgo(2, -3) }),
      ],
    });
    expect(agent(result, "bia").onTime).toEqual({ value: 0, sample: 1 });
    expect(agent(result, "bia").standing).not.toBe("needs_support");
  });

  it("counts unanswered tickets past their deadline as late", () => {
    const result = report({
      opened: [
        opened({ priority: "urgent", firstResponseAt: daysAgo(2, -1) }),
        ...Array.from({ length: 5 }, () =>
          opened({ priority: "urgent", firstResponseAt: null, firstResponderId: null }),
        ),
        opened({ createdAt: daysAgo(0, 1), firstResponseAt: null, firstResponderId: null }),
      ],
    });
    // The one still inside its 24h target is not judged yet.
    expect(result.overview.onTime).toEqual({ value: 1 / 6, sample: 6 });
  });

  it("leaves closes younger than the 7-day window out of 'sem reabrir'", () => {
    const result = report({
      resolutions: [
        resolution({ closedAt: daysAgo(2), openedAt: daysAgo(3) }),
        resolution({ cameBack: true }),
      ],
    });
    expect(result.overview.noReopen).toEqual({ value: 0, sample: 1 });
  });

  it("never reports more ratings than resolutions, nor ratings of older closes", () => {
    const result = report({
      resolutions: [resolution()],
      ratings: [
        rating(),
        rating({ ratedCloseAt: daysAgo(40) }),
        rating({ ratedCloseAt: daysAgo(45) }),
      ],
    });
    expect(result.overview.ratingRate).toBe(1);
  });

  it("averages resolutions only over team members who resolved", () => {
    const result = report({
      resolutions: [
        ...Array.from({ length: 10 }, () => resolution()),
        ...Array.from({ length: 10 }, () => resolution({ resolverId: null })),
      ],
    });
    expect(result.overview.resolvedPerAgent).toBe(10);
  });

  it("keeps replies to other customers out of active days when an origin is picked", () => {
    const result = report(
      {
        replies: [
          { authorId: "ana", origin: "seller", createdAt: daysAgo(3) },
          { authorId: "ana", origin: "supplier", createdAt: daysAgo(4) },
        ],
      },
      "fornecedor",
    );
    expect(agent(result, "ana").activeDays).toBe(1);
  });

  it("splits 7 days into 7 whole days and starts the first week on the period's first day", () => {
    const week = buildSupportPerformanceReport({
      rows: rowsWith({}),
      now: NOW,
      period: periodOf("7d"),
      origin: "todos",
    });
    expect(week.series).toHaveLength(7);
    expect(week.series[0]?.start).toBe("2026-10-18");
    const month = report({});
    expect(month.series[0]?.start).toBe(month.since.slice(0, 10));
  });

  it("hides blocked accounts that did nothing in the period", () => {
    const result = report({
      staff: [
        ...STAFF,
        { id: "saiu", name: "Saiu", role: "agent", joinedAt: daysAgo(200), banned: true },
      ],
    });
    expect(result.team.map((member) => member.id)).not.toContain("saiu");
  });
});
