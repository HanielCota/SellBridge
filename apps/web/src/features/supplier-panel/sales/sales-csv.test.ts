import { describe, expect, it } from "vitest";
import { buildSupplierSalesCsv, supplierEntryLabel } from "./sales-csv";

const line = {
  orderedAt: new Date("2026-10-14T15:30:00Z"),
  paidAt: new Date("2026-10-15T09:00:00Z"),
  externalOrderId: "2000009876",
  status: "delivered",
  reversedAt: null,
  fromEarlierPeriod: false,
  title: "Vestido midi floral",
  sku: "=VES-01",
  quantity: 2,
  receivableCents: 8090,
};

describe("buildSupplierSalesCsv", () => {
  it("writes one line per item with what the supplier receives", () => {
    const [header, row] = buildSupplierSalesCsv([line]).replace("﻿", "").split("\r\n");
    expect(header).toBe(
      "Data do pedido;Pago em;Pedido;Situação;Conta no período como;Cancelado ou devolvido em;Produto;Código;Quantidade;Valor vendido",
    );
    expect(row).toBe(
      "14/10/2026, 12:30;15/10/2026, 06:00;2000009876;Entregue;Venda do período;;Vestido midi floral;'=VES-01;2;80,90",
    );
  });

  it("never carries the reseller's store, buyer or sale price", () => {
    const header = buildSupplierSalesCsv([]).replace("﻿", "").split("\r\n")[0] ?? "";
    for (const column of ["Loja", "Comprador", "Receita", "Lucro", "Preço"]) {
      expect(header).not.toContain(column);
    }
  });
});

describe("supplierEntryLabel", () => {
  it("names the cancellation of an earlier sale", () => {
    expect(supplierEntryLabel({ fromEarlierPeriod: true, status: "cancelled" })).toBe(
      "Cancelamento de venda anterior",
    );
  });

  it("names the return of an earlier sale", () => {
    expect(supplierEntryLabel({ fromEarlierPeriod: true, status: "returned" })).toBe(
      "Devolução de venda anterior",
    );
  });

  it("writes an earlier sale taken back with its cancellation date and negative amounts", () => {
    const undone = {
      ...line,
      status: "cancelled",
      reversedAt: new Date("2026-11-03T13:00:00Z"),
      fromEarlierPeriod: true,
      quantity: -2,
      receivableCents: -8090,
    };

    const row = buildSupplierSalesCsv([undone]).replace("﻿", "").split("\r\n")[1] ?? "";

    expect(row).toContain(";Cancelado;Cancelamento de venda anterior;03/11/2026, 10:00;");
    expect(row.endsWith(";-2;-80,90")).toBe(true);
  });
});
