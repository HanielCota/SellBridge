import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import { describe, expect, it } from "vitest";
import { buildCsvFile, reportFileName } from "./csv-file";

const NOW = new Date("2026-10-27T13:00:00.000Z");

describe("buildCsvFile", () => {
  it("writes Excel-ready cells: money with comma, rates in percent, guarded text", () => {
    const file = buildCsvFile(
      ["Produto", "Valor", "No prazo (%)", "Quando"],
      [["=SOMA(A1)", { cents: -123_456 }, { rate: 0.875 }, { day: NOW }]],
    );
    expect(file.startsWith("﻿")).toBe(true);
    expect(file).toContain("'=SOMA(A1);-1234,56;87,5;27/10/2026\r\n");
  });

  it("leaves unknown values empty instead of writing zero", () => {
    const file = buildCsvFile(["Nota"], [[null], [{ rate: null }]]);
    expect(file.split("\r\n").slice(1, 3)).toEqual(["", ""]);
  });
});

describe("reportFileName", () => {
  it("names the file after the month or the range", () => {
    expect(reportFileName("equipe", resolveReportPeriod({ mes: "2026-09" }, NOW))).toBe(
      "equipe-2026-09.csv",
    );
    expect(
      reportFileName("equipe", resolveReportPeriod({ de: "2026-10-01", ate: "2026-10-15" }, NOW)),
    ).toBe("equipe-2026-10-01-a-2026-10-15.csv");
  });
});
