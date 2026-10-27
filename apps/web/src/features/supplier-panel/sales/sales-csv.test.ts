import { describe, expect, it } from "vitest";
import { buildSupplierSalesCsv } from "./sales-csv";

const line = {
  orderedAt: new Date("2026-10-14T15:30:00Z"),
  externalOrderId: "2000009876",
  status: "delivered",
  title: "Vestido midi floral",
  sku: "=VES-01",
  quantity: 2,
  receivableCents: 8090,
};

describe("buildSupplierSalesCsv", () => {
  it("writes one line per item with what the supplier receives", () => {
    const [header, row] = buildSupplierSalesCsv([line]).replace("﻿", "").split("\r\n");
    expect(header).toBe("Data;Pedido;Situação;Produto;Código;Quantidade;A receber");
    expect(row).toBe("14/10/2026, 12:30;2000009876;Entregue;Vestido midi floral;'=VES-01;2;80,90");
  });

  it("never carries the reseller's store, buyer or sale price", () => {
    const header = buildSupplierSalesCsv([]).replace("﻿", "").split("\r\n")[0] ?? "";
    for (const column of ["Loja", "Comprador", "Receita", "Lucro", "Preço"]) {
      expect(header).not.toContain(column);
    }
  });
});
