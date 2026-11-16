import { describe, expect, it } from "vitest";
import { buildSupplierSupportReport } from "./report.ts";
import type {
  ReportCloseRow,
  ReportConversationRow,
  ReportReopenRow,
  SupplierSupportRows,
} from "./types.ts";

// Wednesday, 18/11/2026 at 12:00 in Brasília.
const NOW = new Date("2026-11-18T12:00:00-03:00");

function at(isoInBrasilia: string): Date {
  return new Date(`${isoInBrasilia}-03:00`);
}

function conversation(overrides: Partial<ReportConversationRow> = {}): ReportConversationRow {
  return {
    id: crypto.randomUUID(),
    topic: "order",
    createdAt: at("2026-11-10T10:00:00"),
    firstResponseAt: null,
    status: "answered",
    awaitingSince: null,
    closedAt: null,
    ...overrides,
  };
}

function close(overrides: Partial<ReportCloseRow> = {}): ReportCloseRow {
  return {
    ticketId: crypto.randomUUID(),
    topic: "order",
    closedAt: at("2026-11-12T10:00:00"),
    closedBy: "supplier",
    ...overrides,
  };
}

function rowsOf(input: {
  conversations?: ReportConversationRow[];
  closes?: ReportCloseRow[];
  reopens?: ReportReopenRow[];
}): SupplierSupportRows {
  return {
    conversations: input.conversations ?? [],
    closes: input.closes ?? [],
    reopens: input.reopens ?? [],
  };
}

function report(rows: SupplierSupportRows, days: 7 | 30 | 90 = 30) {
  return buildSupplierSupportReport(rows, { days, now: NOW });
}

describe("received conversations", () => {
  it("counts the period and the one before it apart", () => {
    const rows = rowsOf({
      conversations: [
        conversation({ createdAt: at("2026-11-15T09:00:00") }),
        conversation({ createdAt: at("2026-11-13T09:00:00") }),
        conversation({ createdAt: at("2026-11-08T09:00:00") }),
        conversation({ createdAt: at("2026-10-01T09:00:00") }),
      ],
    });

    const result = report(rows, 7);

    expect(result.received).toEqual({ current: 2, previous: 1 });
  });
});

describe("first response", () => {
  it("takes the median time to the supplier's first answer", () => {
    const rows = rowsOf({
      conversations: [
        conversation({
          createdAt: at("2026-11-10T10:00:00"),
          firstResponseAt: at("2026-11-10T11:00:00"),
        }),
        conversation({
          createdAt: at("2026-11-10T10:00:00"),
          firstResponseAt: at("2026-11-10T13:00:00"),
        }),
        conversation({
          createdAt: at("2026-11-10T10:00:00"),
          firstResponseAt: at("2026-11-11T10:00:00"),
        }),
        conversation({ createdAt: at("2026-11-10T10:00:00") }),
      ],
    });

    const result = report(rows);

    expect(result.firstResponseMinutes).toBe(180);
  });

  it("has no median when nothing was answered", () => {
    const result = report(rowsOf({ conversations: [conversation()] }));

    expect(result.firstResponseMinutes).toBeNull();
  });
});

describe("answered within one business day", () => {
  it("counts an answer before the deadline as on time and one after as late", () => {
    const rows = rowsOf({
      conversations: [
        // Friday: on time until Monday ends.
        conversation({
          createdAt: at("2026-11-06T16:00:00"),
          firstResponseAt: at("2026-11-09T17:00:00"),
        }),
        // Monday: late on Wednesday.
        conversation({
          createdAt: at("2026-11-09T09:00:00"),
          firstResponseAt: at("2026-11-11T09:00:00"),
        }),
      ],
    });

    const result = report(rows);

    expect(result.answeredOnTime).toEqual({ count: 1, of: 2 });
  });

  it("counts a conversation never answered after its deadline as late", () => {
    const rows = rowsOf({
      conversations: [conversation({ createdAt: at("2026-11-09T09:00:00"), status: "open" })],
    });

    const result = report(rows);

    expect(result.answeredOnTime).toEqual({ count: 0, of: 1 });
  });

  it("leaves out a conversation whose deadline has not come yet", () => {
    const rows = rowsOf({
      conversations: [conversation({ createdAt: at("2026-11-18T09:00:00"), status: "open" })],
    });

    const result = report(rows);

    expect(result.answeredOnTime).toEqual({ count: 0, of: 0 });
  });

  it("leaves out a conversation the store finished before the answer was due", () => {
    const rows = rowsOf({
      conversations: [
        conversation({
          createdAt: at("2026-11-09T09:00:00"),
          status: "closed",
          closedAt: at("2026-11-09T15:00:00"),
        }),
      ],
    });

    const result = report(rows);

    expect(result.answeredOnTime).toEqual({ count: 0, of: 0 });
  });
});

describe("waiting now", () => {
  it("counts what waits for the supplier, the late ones and the oldest", () => {
    const rows = rowsOf({
      conversations: [
        conversation({ status: "open", awaitingSince: at("2026-11-13T10:00:00") }),
        conversation({ status: "open", awaitingSince: at("2026-11-18T08:00:00") }),
        conversation({ status: "answered", awaitingSince: null }),
      ],
    });

    const result = report(rows);

    expect(result.waiting).toEqual({
      count: 2,
      late: 1,
      oldestSince: at("2026-11-13T10:00:00"),
    });
  });

  it("is empty when nothing waits", () => {
    const result = report(rowsOf({ conversations: [conversation()] }));

    expect(result.waiting).toEqual({ count: 0, late: 0, oldestSince: null });
  });
});

describe("finished conversations", () => {
  it("splits the finishes in the period by who finished them", () => {
    const rows = rowsOf({
      closes: [
        close({ closedBy: "supplier" }),
        close({ closedBy: "supplier" }),
        close({ closedBy: "store" }),
        close({ closedBy: "automatic" }),
        close({ closedBy: "store", closedAt: at("2026-09-01T10:00:00") }),
      ],
    });

    const result = report(rows);

    expect(result.finished).toEqual({ total: 4, supplier: 2, store: 1, automatic: 1 });
  });

  it("counts a conversation the store opened again within 7 days as came back", () => {
    const back = close({ closedAt: at("2026-11-10T10:00:00") });
    const tooLate = close({ closedAt: at("2026-11-01T10:00:00") });
    const settled = close({ closedAt: at("2026-11-11T10:00:00") });
    const rows = rowsOf({
      closes: [back, tooLate, settled],
      reopens: [
        { ticketId: back.ticketId, reopenedAt: at("2026-11-14T10:00:00") },
        { ticketId: tooLate.ticketId, reopenedAt: at("2026-11-12T10:00:00") },
      ],
    });

    const result = report(rows);

    expect(result.cameBack).toEqual({ count: 1, of: 3 });
  });
});

describe("subjects", () => {
  it("lists the topics with activity, the busiest first", () => {
    const rows = rowsOf({
      conversations: [
        conversation({ topic: "return" }),
        conversation({ topic: "cancellation" }),
        conversation({ topic: "cancellation" }),
      ],
      closes: [close({ topic: "product" })],
    });

    const result = report(rows);

    expect(result.subjects.map((subject) => [subject.topic, subject.received])).toEqual([
      ["cancellation", 2],
      ["return", 1],
      ["product", 0],
    ]);
  });
});
