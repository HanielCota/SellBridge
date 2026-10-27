import type { SalesSummary } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import type { ReportChart, ReportMetricRow } from "@/features/report-kit/report-model";
import { parseStoredReport } from "@/features/report-kit/report-schema";
import {
  allOrdersOf,
  buildSellerReport,
  marginOf,
  type SellerPeriodNumbers,
  type SellerReportInput,
} from "./seller-report";
import { STORE_BARS } from "./seller-report-charts";

function summary(overrides: Partial<SalesSummary> = {}): SalesSummary {
  return {
    orders: 0,
    cancelledOrders: 0,
    revenueCents: 0,
    costCents: 0,
    feeCents: 0,
    refundCents: 0,
    returnCents: 0,
    commissionCents: 0,
    platformFeeCents: 0,
    profitCents: 0,
    pendingCostOrders: 0,
    pendingCostRevenueCents: 0,
    averageTicketCents: null,
    ...overrides,
  };
}

const EMPTY_PERIOD: SellerPeriodNumbers = {
  summary: summary(),
  statuses: { pending: 0, paid: 0, shipped: 0, delivered: 0, cancelled: 0, returned: 0 },
  byStore: [],
  topProducts: [],
};

const NO_CASES: SellerReportInput["cases"] = {
  cost_pending: { total: 0, items: [] },
  cancelled: { total: 0, items: [] },
  returned: { total: 0, items: [] },
};

const CURRENT: SellerPeriodNumbers = {
  summary: summary({
    orders: 8,
    cancelledOrders: 3,
    revenueCents: 80_000,
    profitCents: 18_000,
    pendingCostOrders: 2,
    pendingCostRevenueCents: 20_000,
    averageTicketCents: 10_000,
  }),
  statuses: { pending: 1, paid: 2, shipped: 2, delivered: 4, cancelled: 2, returned: 1 },
  byStore: [
    {
      storeConnectionId: "s1",
      storeName: "Loja 1",
      orders: 5,
      revenueCents: 50_000,
      profitCents: 10_000,
      pendingCostRevenueCents: 0,
    },
    {
      storeConnectionId: "s2",
      storeName: "Loja 2",
      orders: 3,
      revenueCents: 30_000,
      profitCents: 8000,
      pendingCostRevenueCents: 20_000,
    },
  ],
  topProducts: [{ title: "Vestido", units: 4, revenueCents: 40_000 }],
};

const PREVIOUS: SellerPeriodNumbers = {
  summary: summary({
    orders: 4,
    revenueCents: 40_000,
    profitCents: 12_000,
    averageTicketCents: 10_000,
  }),
  statuses: { pending: 0, paid: 0, shipped: 0, delivered: 4, cancelled: 0, returned: 0 },
  byStore: [
    {
      storeConnectionId: "s3",
      storeName: "Loja antiga",
      orders: 4,
      revenueCents: 40_000,
      profitCents: 12_000,
      pendingCostRevenueCents: 0,
    },
  ],
  topProducts: [{ title: "Vestido", units: 1, revenueCents: 10_000 }],
};

function input(overrides: Partial<SellerReportInput> = {}): SellerReportInput {
  return {
    current: CURRENT,
    previous: PREVIOUS,
    trend: [
      { month: "2026-09", orders: 0, profitCents: 0 },
      { month: "2026-10", orders: 8, profitCents: 18_000 },
    ],
    heatmap: [{ weekday: 7, band: 3, orders: 8 }],
    cases: {
      ...NO_CASES,
      cancelled: {
        total: 10,
        items: [
          {
            id: "o1",
            externalOrderId: "ML-1",
            storeName: "Loja 1",
            orderedAt: new Date("2026-10-05T15:00:00Z"),
            totalCents: 9900,
          },
        ],
      },
    },
    platformFeeBasisPoints: 250,
    ...overrides,
  };
}

function metricRow(label: string, report = buildSellerReport(input())): ReportMetricRow {
  const row = report.indicators.find(
    (candidate) => candidate.kind === "metric" && candidate.label === label,
  );
  if (row?.kind !== "metric") {
    throw new Error(`indicador ${label} ausente`);
  }
  return row;
}

function chartOf<Kind extends ReportChart["kind"]>(
  kind: Kind,
  title?: string,
): Extract<ReportChart, { kind: Kind }> {
  const chart = buildSellerReport(input()).charts.find(
    (candidate): candidate is Extract<ReportChart, { kind: Kind }> =>
      candidate.kind === kind &&
      (title === undefined || ("title" in candidate && candidate.title === title)),
  );
  if (chart === undefined) {
    throw new Error(`gráfico ${kind} ausente`);
  }
  return chart;
}

describe("seller report", () => {
  it("splits every order of the period into sales and the rest", () => {
    const { statuses } = CURRENT;
    expect(allOrdersOf(statuses)).toBe(12);
    const sales = statuses.paid + statuses.shipped + statuses.delivered;
    expect(sales + statuses.pending + statuses.cancelled + statuses.returned).toBe(
      allOrdersOf(statuses),
    );
    expect(buildSellerReport(input()).indicators[0]).toEqual({
      kind: "group",
      label: "Pedidos do período · 12",
      note: null,
    });
  });

  it("gives each problem rate over all orders, with the base", () => {
    const cancelled = metricRow("Cancelados");
    expect(cancelled).toMatchObject({
      count: 2,
      rate: 2 / 12,
      base: "de 12 pedidos",
      previous: 0,
      sense: "lower_is_better",
    });
    expect(metricRow("Devolvidos")).toMatchObject({ count: 1, rate: 1 / 12 });
    expect(metricRow("Custo pendente")).toMatchObject({
      count: 2,
      rate: 2 / 8,
      base: "de 8 vendas",
      previous: 0,
    });
  });

  it("computes the margin over the revenue of priced sales only", () => {
    expect(marginOf(CURRENT.summary)).toBe(18_000 / 60_000);
    expect(metricRow("Margem")).toMatchObject({ rate: 0.3, previous: 0.3 });
    expect(metricRow("Lucro").base).toBe("sem 2 vendas de custo pendente");
  });

  it("leaves rates empty when their base is zero", () => {
    const report = buildSellerReport(
      input({
        current: EMPTY_PERIOD,
        previous: EMPTY_PERIOD,
        trend: [],
        heatmap: [],
        cases: NO_CASES,
      }),
    );
    expect(report.empty).toBe(true);
    expect(metricRow("Cancelados", report).rate).toBeNull();
    expect(metricRow("Margem", report).rate).toBeNull();
    expect(metricRow("Custo pendente", report).previous).toBeNull();
    expect(report.attention).toBeNull();
  });

  it("compares stores sold in either period and folds the long tail", () => {
    expect(chartOf("grouped_bars", "Receita por loja").items).toEqual([
      { label: "Loja 1", current: 50_000, previous: 0 },
      { label: "Loja 2", current: 30_000, previous: 0 },
      { label: "Loja antiga", current: 0, previous: 40_000 },
    ]);
    const many = Array.from({ length: STORE_BARS + 3 }, (_, index) => ({
      storeConnectionId: `m${index}`,
      storeName: `Loja ${index}`,
      orders: 1,
      revenueCents: 1000 * (index + 1),
      profitCents: 0,
      pendingCostRevenueCents: 0,
    }));
    const report = buildSellerReport(
      input({ current: { ...CURRENT, byStore: many }, previous: EMPTY_PERIOD }),
    );
    const bars = report.charts.find((chart) => chart.kind === "grouped_bars");
    const items = bars?.kind === "grouped_bars" ? bars.items : [];
    expect(items).toHaveLength(STORE_BARS + 1);
    expect(items.at(-1)?.label).toBe("Outras 3 lojas");
    const total = items.reduce((sum, item) => sum + item.current, 0);
    expect(total).toBe(many.reduce((sum, store) => sum + store.revenueCents, 0));
  });

  it("shows a month without sales as a gap in the profit trend", () => {
    expect(chartOf("trend").points).toEqual([
      { month: "2026-09", value: null },
      { month: "2026-10", value: 18_000 },
    ]);
  });

  it("splits sales against cancelled and returned orders", () => {
    expect(chartOf("split").rows[0]).toMatchObject({ yes: 8, no: 3 });
    expect(chartOf("split").rows[1]).toMatchObject({ yes: 4, no: 0 });
  });

  it("places the heatmap cell on its weekday and band", () => {
    const { heatmap } = chartOf("heatmap");
    expect(heatmap.cells).toHaveLength(7);
    expect(heatmap.cells[6]?.[3]).toBe(8);
    expect(heatmap.cells.flat().reduce((sum, cell) => sum + cell, 0)).toBe(8);
  });

  it("lists the cases with a link to the order and how many are left out", () => {
    const tab = buildSellerReport(input()).cases.find((candidate) => candidate.key === "cancelled");
    expect(tab).toMatchObject({ label: "Cancelados", more: 9 });
    expect(tab?.items[0]).toMatchObject({
      title: "Pedido ML-1",
      detail: "Loja 1",
      href: "/pedidos/o1",
    });
  });

  it("fits the stored report shape, so a closed month can be kept", () => {
    const report = buildSellerReport(input());
    expect(parseStoredReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });
});
