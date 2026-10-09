import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { buildFinancialCsv, centsToCsv, textCell } from "./csv";

const row: OrderFinancialRow = {
  id: "1",
  externalOrderId: "ORD-1",
  orderedAt: new Date("2026-03-01T13:00:00Z"),
  status: "delivered",
  storeName: "Loja; da Ana",
  buyerName: null,
  items: "Camiseta (x1)",
  revenueCents: 10_000,
  costCents: 4000,
  feeCents: 1400,
  refundCents: 0,
  returnCents: 0,
  commissionCents: 300,
  platformFeeCents: 250,
  profitCents: -5,
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
    expect(csv.slice(1).startsWith("Data;Pedido;")).toBe(true);
    expect(csv.trim().split("\r\n")).toHaveLength(2);
  });

  it("formats text and money columns", () => {
    const line = buildFinancialCsv([row]).trim().split("\r\n")[1] ?? "";
    expect(line).toContain('"Loja; da Ana"');
    expect(line).toContain(";;Entregue;");
    expect(line.endsWith(";-0,05")).toBe(true);
  });

  it("handles an empty export", () => {
    expect(buildFinancialCsv([]).trim().split("\r\n")).toHaveLength(1);
  });
});
