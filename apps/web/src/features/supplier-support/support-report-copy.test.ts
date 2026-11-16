import type { SupplierSupportReport } from "@sellbridge/shared/supplier-support-report";
import { describe, expect, it } from "vitest";
import {
  cameBackCopy,
  finishedCopy,
  firstResponseCopy,
  onTimeCopy,
  receivedCopy,
  subjectCameBackText,
  waitingCopy,
} from "./support-report-copy";

function reportWith(overrides: Partial<SupplierSupportReport> = {}): SupplierSupportReport {
  return {
    days: 30,
    waiting: { count: 0, late: 0, oldestSince: null },
    received: { current: 0, previous: 0 },
    firstResponseMinutes: null,
    answeredOnTime: { count: 0, of: 0 },
    finished: { total: 0, supplier: 0, store: 0, automatic: 0 },
    cameBack: { count: 0, of: 0 },
    subjects: [],
    ...overrides,
  };
}

describe("waitingCopy", () => {
  it("says how many wait, since when and how many are late", () => {
    const copy = waitingCopy({
      count: 3,
      late: 1,
      oldestSince: new Date("2026-11-13T10:00:00-03:00"),
    });

    expect(copy).toEqual({
      headline: "3 conversas esperam sua resposta",
      detail: "A mais antiga espera desde 13/11.",
      late: "1 passou de 1 dia útil",
    });
  });

  it("uses the singular for one conversation", () => {
    const copy = waitingCopy({
      count: 1,
      late: 0,
      oldestSince: new Date("2026-11-18T09:00:00-03:00"),
    });

    expect(copy.headline).toBe("1 conversa espera sua resposta");
    expect(copy.late).toBeNull();
  });

  it("tells what will appear when nothing waits", () => {
    const copy = waitingCopy({ count: 0, late: 0, oldestSince: null });

    expect(copy.headline).toBe("Nenhuma conversa espera sua resposta");
  });
});

describe("figures", () => {
  it("compares the received conversations with the period before", () => {
    const copy = receivedCopy(reportWith({ received: { current: 12, previous: 9 } }));

    expect(copy).toEqual({ figure: "12", detail: "9 nos 30 dias anteriores" });
  });

  it("shows the typical first answer, or a dash without answers", () => {
    expect(firstResponseCopy(reportWith({ firstResponseMinutes: 200 })).figure).toBe("3h 20min");
    expect(firstResponseCopy(reportWith()).figure).toBe("—");
  });

  it("writes the on-time share with the numbers beside it", () => {
    expect(onTimeCopy({ count: 18, of: 20 })).toEqual({
      figure: "90%",
      detail: "18 de 20 conversas",
    });
  });

  it("does not show a percentage when no answer was due", () => {
    expect(onTimeCopy({ count: 0, of: 0 }).figure).toBe("—");
  });

  it("splits the finished conversations by who finished them", () => {
    const copy = finishedCopy({ total: 15, supplier: 9, store: 5, automatic: 1 });

    expect(copy).toEqual({ figure: "15", detail: "9 por você · 5 pela loja · 1 sozinha" });
  });

  it("writes the conversations that came back out of the finished ones", () => {
    expect(cameBackCopy({ count: 2, of: 15 })).toEqual({
      figure: "2",
      detail: "de 15 finalizadas",
    });
    expect(subjectCameBackText({ count: 0, of: 0 })).toBe("—");
  });
});
