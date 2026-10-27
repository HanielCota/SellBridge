import { describe, expect, it } from "vitest";
import { MONTHLY_REPORT_VERSION, type MonthlyReport } from "./report-model";
import { parseStoredReport } from "./report-schema";

const REPORT: MonthlyReport = {
  version: MONTHLY_REPORT_VERSION,
  title: "Relatório de vendas",
  itemNoun: "pedido",
  empty: false,
  indicators: [
    { kind: "group", label: "Pedidos do período · 10", note: null },
    {
      kind: "metric",
      label: "Cancelados",
      base: "de 10 pedidos",
      count: 1,
      countFormat: "count",
      rate: 0.1,
      rateFormat: "rate",
      previous: 0.05,
      target: { value: 0.02, kind: "max" },
      sense: "lower_is_better",
      indent: false,
    },
  ],
  charts: [
    {
      kind: "trend",
      title: "Lucro mês a mês",
      note: null,
      format: "cents",
      target: null,
      points: [{ month: "2026-09", value: 1000 }],
    },
  ],
  attention: null,
  cases: [],
  team: null,
  rules: [{ title: "Período", text: "Horário de Brasília." }],
};

describe("parseStoredReport", () => {
  it("reads back a report saved as JSON", () => {
    expect(parseStoredReport(JSON.parse(JSON.stringify(REPORT)))).toEqual(REPORT);
  });

  it("refuses a snapshot of another version so it is recomputed", () => {
    expect(parseStoredReport({ ...REPORT, version: MONTHLY_REPORT_VERSION + 1 })).toBeNull();
    expect(parseStoredReport({ orders: 10 })).toBeNull();
  });
});
