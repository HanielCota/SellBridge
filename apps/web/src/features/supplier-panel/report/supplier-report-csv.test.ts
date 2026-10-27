import { describe, expect, it } from "vitest";
import { buildCsvFile } from "@/features/report-kit/csv-file";
import {
  SUPPLIER_ORDER_HEADERS,
  SUPPLIER_PRODUCT_HEADERS,
  productSituation,
  supplierFileSlug,
  supplierOrderRows,
  supplierProductRows,
} from "./supplier-report-csv";
import { NOW, productRow, shipmentAt } from "./supplier-report.fixtures";

/** Words of a column that would hand the supplier the reseller's price or the buyer's contact. */
const PRIVATE_COLUMN =
  /venda|margem|lucro|comprador|cliente|e-mail|telefone|cpf|endereço|rua|loja/i;

function cellOf(
  row: readonly unknown[] | undefined,
  header: (typeof SUPPLIER_ORDER_HEADERS)[number],
) {
  return row?.[SUPPLIER_ORDER_HEADERS.indexOf(header)];
}

describe("supplier spreadsheets", () => {
  it("has no column with the reseller's sale price or the buyer's contact", () => {
    for (const header of [...SUPPLIER_ORDER_HEADERS, ...SUPPLIER_PRODUCT_HEADERS]) {
      expect(header).not.toMatch(PRIVATE_COLUMN);
    }
  });

  it("writes one row per item with what the supplier receives for it", () => {
    const parcel = shipmentAt("2026-09-02T15:00:00.000Z", {
      items: [
        { title: "Caneca", sku: "CAN-1", quantity: 2, unitCostCents: 1500, productId: "p1" },
        { title: "Copo", sku: "COPO", quantity: 1, unitCostCents: null, productId: null },
      ],
    });
    const rows = supplierOrderRows([parcel], NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(SUPPLIER_ORDER_HEADERS.length);
    expect(cellOf(rows[0], "Valor que você recebe (R$)")).toEqual({ cents: 3000 });
    expect(cellOf(rows[1], "Valor que você recebe (R$)")).toBeNull();
    expect(cellOf(rows[0], "Cidade de destino")).toBe("Recife");
    expect(cellOf(rows[0], "UF de destino")).toBe("PE");
    expect(cellOf(rows[0], "No prazo")).toBe("Sim");
  });

  it("says a parcel dispatched after its time was not on time", () => {
    const rows = supplierOrderRows(
      [shipmentAt("2026-09-02T15:00:00.000Z", { shippedAfterHours: 60 })],
      NOW,
    );
    expect(cellOf(rows[0], "No prazo")).toBe("Não");
  });

  it("keeps a line for a parcel without items and names the supplier's own cancellation", () => {
    const parcel = shipmentAt("2026-09-02T15:00:00.000Z", {
      items: [],
      status: "cancelled",
      shippedAfterHours: null,
      acceptedAt: null,
      cancelledBySupplier: true,
    });
    const rows = supplierOrderRows([parcel], NOW);
    expect(rows).toHaveLength(1);
    expect(cellOf(rows[0], "Situação")).toBe("Cancelado por você");
  });

  it("writes the file with the headers first and Brazilian money", () => {
    const file = buildCsvFile(
      SUPPLIER_ORDER_HEADERS,
      supplierOrderRows([shipmentAt("2026-09-02T15:00:00.000Z")], NOW),
    );
    const [header, first] = file.replace("﻿", "").split("\r\n");
    expect(header?.startsWith("Recebido em;Pedido;Produto;SKU;Quantidade")).toBe(true);
    expect(first).toContain(";30,00;");
  });

  it("names each product's situation and flags one sold out but still listed", () => {
    const soldOut = productRow({ stock: 3, reservedStock: 3 });
    const rejected = productRow({
      reviewStatus: "rejected",
      rejectionReasons: [{ field: "title", rule: "title_policy", message: "Revise o título" }],
      publishedListings: 0,
    });
    expect(productSituation(soldOut)).toBe("Esgotado");
    expect(productSituation(productRow({ active: false }))).toBe("Desativado");
    const [soldOutRow, rejectedRow] = supplierProductRows([soldOut, rejected]);
    expect(soldOutRow?.at(-1)).toBe("Sim");
    expect(rejectedRow?.slice(5, 7)).toEqual(["Recusado", "Revise o título"]);
    expect(rejectedRow?.at(-1)).toBe("Não");
  });

  it("names the file after the supplier, without accents or spaces", () => {
    expect(supplierFileSlug("Malhas São João Ltda.")).toBe("malhas-sao-joao-ltda");
    expect(supplierFileSlug("!!!")).toBe("fornecedor");
  });
});
