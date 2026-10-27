import { resolveReportPeriod } from "@sellbridge/shared/report-period";
import { describe, expect, it } from "vitest";
import type { ReportChart, ReportMetricRow } from "@/features/report-kit/report-model";
import { parseStoredReport } from "@/features/report-kit/report-schema";
import { buildAdminReport } from "./admin-report-builder";
import { adminRows, ANA, BIA, CARLA, NOW } from "./admin-report-fixtures";

const SEPTEMBER = resolveReportPeriod({ mes: "2026-09" }, NOW);

function report() {
  return buildAdminReport({ rows: adminRows(), period: SEPTEMBER, now: NOW });
}

function metric(label: string): ReportMetricRow {
  const row = report().indicators.find(
    (candidate): candidate is ReportMetricRow =>
      candidate.kind === "metric" && candidate.label === label,
  );
  if (row === undefined) {
    throw new Error(`No indicator "${label}"`);
  }
  return row;
}

function chart<Kind extends ReportChart["kind"]>(kind: Kind): Extract<ReportChart, { kind: Kind }> {
  const found = report().charts.find(
    (candidate): candidate is Extract<ReportChart, { kind: Kind }> => candidate.kind === kind,
  );
  if (found === undefined) {
    throw new Error(`No ${kind} chart`);
  }
  return found;
}

describe("admin monthly report", () => {
  it("counts only the period's tickets and compares them with the month before", () => {
    expect(metric("Criados")).toMatchObject({ count: 3, previous: 1 });
    expect(metric("Encerrados")).toMatchObject({ count: 3, previous: 1 });
    expect(metric("Reabertos")).toMatchObject({ count: 1, sense: "lower_is_better" });
    const groups = report().indicators.filter((row) => row.kind === "group");
    expect(groups.map((row) => row.label)).toContain("Criados no período · 3");
    expect(groups.find((row) => row.label.startsWith("Encerrados"))).toMatchObject({
      note: "1 deles abertos antes do período",
    });
  });

  it("judges the deadline like the Desempenho screen and gives the rate its base", () => {
    // Normal answered in 1h (on time), urgent answered in 5h (late), one unanswered long past due.
    expect(metric("Respondidos dentro do prazo")).toMatchObject({
      rate: 1 / 3,
      base: "de 3 respondidos ou com prazo vencido",
      target: { value: 0.8, kind: "min" },
    });
    expect(metric("Nota média")).toMatchObject({ rate: 3.5, base: "de 2 notas" });
  });

  it("lists who worked in the period, a former member included, and leaves out who did not", () => {
    const team = report().team ?? [];
    expect(team.map((row) => row.id)).toEqual([ANA.id, BIA.id, CARLA.id]);
    expect(team[0]).toMatchObject({
      name: "Ana Souza",
      days: 2,
      total: 1,
      topCategory: "Pedido ou entrega",
    });
    expect(team[1]).toMatchObject({
      averageRating: 2,
      ratings: 1,
      medianMinutes: 300,
      onTimeRate: 0,
    });
  });

  it("draws the charts from the same rows", () => {
    expect(chart("grouped_bars").items).toContainEqual({
      label: "Pedido ou entrega",
      current: 2,
      previous: 1,
    });
    expect(chart("trend").points).toHaveLength(6);
    expect(chart("trend").points.at(-1)?.month).toBe("2026-09");
    expect(chart("histogram").buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2);
    const heatmap = chart("heatmap").heatmap;
    expect(heatmap.cells.flat().reduce((sum, value) => sum + value, 0)).toBe(3);
    // 20:30 in Brasília on a Sunday is outside support hours: the last column.
    expect(heatmap.cells[6]?.at(-1)).toBe(1);
    expect(chart("rating").counts.find((count) => count.stars === 2)?.count).toBe(1);
  });

  it("links each case to the ticket and keeps the customer's comment", () => {
    const tabs = report().cases;
    const low = tabs.find((tab) => tab.key === "notas-baixas")?.items[0];
    expect(low).toMatchObject({
      detail: '"Demorou demais"',
      href: "/admin/chamados/bbbbbbbb-0000-0000-0000-000000000000",
    });
    expect(tabs.find((tab) => tab.key === "fora-do-prazo")?.items).toHaveLength(2);
    expect(tabs.find((tab) => tab.key === "reabertos")?.items).toHaveLength(1);
  });

  it("states the credit rule and survives the snapshot round trip", () => {
    const built = report();
    expect(built.rules.map((rule) => rule.title)).toContain("Quem leva o crédito");
    expect(parseStoredReport(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it("is empty when nothing happened in the period", () => {
    const rows = adminRows({ opened: [], resolutions: [], ratings: [], replies: [] });
    expect(buildAdminReport({ rows, period: SEPTEMBER, now: NOW }).empty).toBe(true);
  });
});
