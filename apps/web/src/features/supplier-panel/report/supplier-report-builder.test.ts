import { describe, expect, it } from "vitest";
import type {
  ReportChart,
  ReportIndicatorRow,
  ReportMetricRow,
} from "@/features/report-kit/report-model";
import { buildSupplierReport } from "./supplier-report-builder";
import { reportInput, reviewAt, shipmentAt } from "./supplier-report.fixtures";

function metricOf(rows: readonly ReportIndicatorRow[], label: string): ReportMetricRow {
  const row = rows.find((candidate) => candidate.label === label);
  if (row?.kind !== "metric") {
    throw new Error(`Sem a linha ${label}`);
  }
  return row;
}

function chartOf<Kind extends ReportChart["kind"]>(charts: readonly ReportChart[], kind: Kind) {
  const chart = charts.find(
    (candidate): candidate is Extract<ReportChart, { kind: Kind }> => candidate.kind === kind,
  );
  if (chart === undefined) {
    throw new Error(`Sem o gráfico ${kind}`);
  }
  return chart;
}

/** Twelve parcels received in September (Brazil), one every day from the 2nd at noon. */
function septemberParcels(count: number, shippedAfterHours = 10) {
  return Array.from({ length: count }, (_, index) => {
    const day = String(index + 2).padStart(2, "0");
    return shipmentAt(`2026-09-${day}T15:00:00.000Z`, { shippedAfterHours });
  });
}

describe("buildSupplierReport", () => {
  it("reads as empty when nothing was received, dispatched or rated", () => {
    expect(buildSupplierReport(reportInput()).empty).toBe(true);
  });

  it("counts receipts by receipt date and dispatches by dispatch date", () => {
    const fromAugust = shipmentAt("2026-08-31T20:00:00.000Z", { shippedAfterHours: 20 });
    const report = buildSupplierReport(
      reportInput({ shipments: [...septemberParcels(2), fromAugust] }),
    );
    const groups = report.indicators.filter((row) => row.kind === "group");
    expect(groups[0]).toMatchObject({ label: "Recebidos no período · 2" });
    expect(groups[1]).toMatchObject({
      label: "Despachados no período · 3",
      note: "1 dele recebido no período anterior",
    });
    expect(metricOf(report.indicators, "Pedidos recebidos")).toMatchObject({
      count: 2,
      previous: 1,
    });
  });

  it("marks a rate over fewer than ten orders as few data and judges no target", () => {
    const report = buildSupplierReport(reportInput({ shipments: septemberParcels(3) }));
    const accept = metricOf(report.indicators, "Aceitos no prazo");
    expect(accept.base).toBe("de 3 aceites contados · poucos dados");
    expect(accept.target).toBeNull();
    expect(accept.rate).toBe(1);
  });

  it("judges dispatch on time against 90% once ten parcels count", () => {
    const late = shipmentAt("2026-09-20T15:00:00.000Z", { shippedAfterHours: 60 });
    const report = buildSupplierReport(reportInput({ shipments: [...septemberParcels(11), late] }));
    const dispatch = metricOf(report.indicators, "Despachados no prazo");
    expect(dispatch).toMatchObject({
      base: "de 12 despachados",
      count: 11,
      target: { value: 0.9, kind: "min" },
    });
    expect(dispatch.rate).toBeCloseTo(11 / 12);
    const split = chartOf(report.charts, "split");
    expect(split.rows[1]).toMatchObject({ label: "Despacho", yes: 11, no: 1 });
  });

  it("counts only the supplier's own cancellations among settled parcels", () => {
    const cancelled = shipmentAt("2026-09-10T15:00:00.000Z", {
      status: "cancelled",
      shippedAfterHours: null,
      acceptedAt: null,
      cancelledBySupplier: true,
    });
    const byReseller = shipmentAt("2026-09-11T15:00:00.000Z", {
      status: "cancelled",
      shippedAfterHours: null,
      acceptedAt: null,
    });
    const report = buildSupplierReport(
      reportInput({ shipments: [...septemberParcels(3), cancelled, byReseller] }),
    );
    expect(metricOf(report.indicators, "Cancelados por você")).toMatchObject({
      count: 1,
      rate: 0.25,
      base: "de 4 concluídos · poucos dados",
    });
    const cases = report.cases.find((tab) => tab.key === "cancelados");
    expect(cases?.items).toHaveLength(1);
  });

  it("averages the ratings given in the month and lists the low ones with their comment", () => {
    const reviews = [
      reviewAt("2026-09-05T15:00:00.000Z", 5),
      reviewAt("2026-09-06T15:00:00.000Z", 2, "Chegou amassado"),
      reviewAt("2026-08-20T15:00:00.000Z", 1),
    ];
    const report = buildSupplierReport(reportInput({ reviews }));
    expect(metricOf(report.indicators, "Nota média")).toMatchObject({
      rate: 3.5,
      previous: 1,
      base: "de 2 avaliações · poucos dados",
      target: null,
    });
    const low = report.cases.find((tab) => tab.key === "notas-baixas");
    expect(low?.items).toEqual([expect.objectContaining({ detail: "Chegou amassado" })]);
    expect(chartOf(report.charts, "rating").counts).toContainEqual({ stars: 2, count: 1 });
  });

  it("puts each dispatch time in its band, with the median", () => {
    const shipments = [
      shipmentAt("2026-09-02T15:00:00.000Z", { shippedAfterHours: 5 }),
      shipmentAt("2026-09-03T15:00:00.000Z", { shippedAfterHours: 30 }),
      shipmentAt("2026-09-04T15:00:00.000Z", { shippedAfterHours: 80 }),
    ];
    const histogram = chartOf(buildSupplierReport(reportInput({ shipments })).charts, "histogram");
    expect(histogram.buckets.map((bucket) => bucket.count)).toEqual([1, 0, 1, 0, 1]);
    expect(histogram.median).toBe("1 dia 6h");
  });

  it("draws six months of dispatch on time, ending at the report's month", () => {
    const trend = chartOf(
      buildSupplierReport(reportInput({ shipments: septemberParcels(2) })).charts,
      "trend",
    );
    expect(trend.points.map((point) => point.month)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(trend.points.at(-1)?.value).toBe(1);
    expect(trend.points[0]?.value).toBeNull();
  });

  it("ranks best sellers without cancelled parcels, next to the previous period", () => {
    const cancelled = shipmentAt("2026-09-12T15:00:00.000Z", {
      status: "cancelled",
      shippedAfterHours: null,
      items: [{ title: "Copo", sku: "COPO", quantity: 50, unitCostCents: 100, productId: "p2" }],
    });
    const august = shipmentAt("2026-08-12T15:00:00.000Z");
    const bars = chartOf(
      buildSupplierReport(reportInput({ shipments: [...septemberParcels(2), cancelled, august] }))
        .charts,
      "grouped_bars",
    );
    expect(bars.items).toEqual([{ label: "Caneca", current: 4, previous: 2 }]);
  });

  it("links a late parcel to its order in Pedidos and keeps the rest for the spreadsheet", () => {
    const late = Array.from({ length: 10 }, (_, index) =>
      shipmentAt(`2026-09-${String(index + 10)}T15:00:00.000Z`, { shippedAfterHours: 60 }),
    );
    const report = buildSupplierReport(reportInput({ shipments: late }));
    const tab = report.cases.find((candidate) => candidate.key === "atrasados");
    expect(tab?.items).toHaveLength(8);
    expect(tab?.more).toBe(2);
    expect(tab?.items[0]?.href).toBe(
      `/fornecedor/painel/pedidos?tab=shipped&query=${late[0]?.externalOrderId}`,
    );
    expect(tab?.items[0]?.detail).toMatch(/^Despacho atrasado · despachado em/);
    expect(report.attention?.items[0]).toEqual({
      label: "Atrasados",
      count: 10,
      base: "de 10 pedidos recebidos",
    });
  });

  it("states the supplier's own accept and dispatch hours in the rules", () => {
    const report = buildSupplierReport(
      reportInput({ supplier: { acceptWithinHours: 12, dispatchWithinHours: 36 } }),
    );
    const deadlines = report.rules.find((rule) => rule.title === "Prazos de aceite e despacho");
    expect(deadlines?.text).toContain("12 horas para aceitar e 36 horas para despachar");
  });
});
