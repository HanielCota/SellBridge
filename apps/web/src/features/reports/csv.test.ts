import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { buildFinancialCsv, centsToCsv, periodEntryLabel, textCell } from "./csv";

const row: OrderFinancialRow = {
  id: "1",
  externalOrderId: "ORD-1",
  orderedAt: new Date("2026-03-01T13:00:00Z"),
  paidAt: new Date("2026-03-01T13:00:00Z"),
  reversedAt: null,
  entryDate: new Date("2026-03-01T13:00:00Z"),
  fromEarlierPeriod: false,
  countsAsSale: true,
  deliveredAt: null,
  status: "delivered",
  storeConnectionId: "store-1",
  storeName: "Loja; da Ana",
  buyerName: null,
  items: "Camiseta (x1)",
  revenueCents: 10_000,
  costCents: 4000,
  feeCents: 1400,
  refundCents: 0,
  returnCents: 0,
  commissionCents: 300,
  profitCents: -5,
  costPending: false,
  pendingCostRevenueCents: 0,
  product: null,
};

describe("centsToCsv", () => {
  it.each([
    [0, "0,00"],
    [5, "0,05"],
    [123_456, "1234,56"],
    [-5, "-0,05"],
  ])("formats %i as %s", (cents, expected) => {
    expect(centsToCsv(cents)).toBe(expected);
  });
});

describe("textCell", () => {
  it("keeps plain text", () => {
    expect(textCell("Camiseta")).toBe("Camiseta");
  });

  it("quotes separators and doubles quotes", () => {
    expect(textCell('Loja "A"; centro')).toBe('"Loja ""A""; centro"');
  });

  it("neutralizes formulas even when they also need quotes", () => {
    expect(textCell("=1+1")).toBe("'=1+1");
    expect(textCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(textCell("-10")).toBe("'-10");
  });
});

describe("buildFinancialCsv", () => {
  it("writes a BOM, a header and one line per order", () => {
    const csv = buildFinancialCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith("Data do pedido;Pago em;Pedido;")).toBe(true);
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });

  it("formats text and money columns", () => {
    const line = buildFinancialCsv([row]).trim().split("\r\n")[1] ?? "";
    expect(line).toContain('"Loja; da Ana"');
    expect(line).toContain(";;Entregue;");
    expect(line.endsWith(";-0,05;Não")).toBe(true);
  });

  it("leaves the profit blank and says so when the cost is pending", () => {
    const pending = { ...row, costPending: true, pendingCostRevenueCents: 10_000, profitCents: 0 };
    const [header, line] = buildFinancialCsv([pending]).trim().split("\r\n");
    expect(header?.endsWith(";Lucro;Sem custo informado")).toBe(true);
    expect(line?.endsWith(";;Sim")).toBe(true);
  });

  it("leaves the payment date blank for an order never paid", () => {
    const unpaid = { ...row, status: "pending", paidAt: null };

    const line = buildFinancialCsv([unpaid]).trim().split("\r\n")[1] ?? "";

    expect(line.startsWith("01/03/2026, 10:00;;ORD-1;")).toBe(true);
  });

  it("handles an empty export", () => {
    expect(buildFinancialCsv([]).trim().split("\r\n")).toHaveLength(1);
  });

  it("marks a sale cancelled after its month as a sale, with the cancellation date", () => {
    const cancelledLater = {
      ...row,
      status: "cancelled",
      reversedAt: new Date("2026-04-03T13:00:00Z"),
      countsAsSale: true,
    };

    const line = buildFinancialCsv([cancelledLater]).trim().split("\r\n")[1] ?? "";

    expect(line).toContain(";Cancelado;Venda;03/04/2026, 10:00;");
  });
});

describe("periodEntryLabel", () => {
  const entry = { countsAsSale: false, fromEarlierPeriod: true, revenueCents: -10_000 };

  it("names the cancellation of an earlier sale", () => {
    expect(periodEntryLabel({ ...entry, status: "cancelled" })).toBe(
      "Cancelamento de venda anterior",
    );
  });

  it("names the return of an earlier sale", () => {
    expect(periodEntryLabel({ ...entry, status: "returned" })).toBe("Devolução de venda anterior");
  });

  it("names a refund of an earlier sale that still counts", () => {
    expect(periodEntryLabel({ ...entry, status: "delivered", revenueCents: 0 })).toBe(
      "Reembolso de venda anterior",
    );
  });

  it("says an order of the period cancelled in it is not a sale", () => {
    const cancelled = { ...entry, fromEarlierPeriod: false, revenueCents: 0, status: "cancelled" };

    expect(periodEntryLabel(cancelled)).toBe("Não conta como venda");
  });
});
