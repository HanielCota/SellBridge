import type { SupplierSaleLine } from "@sellbridge/database/repositories";
import {
  BOM,
  centsToCsv,
  dateFormatter,
  paidAtCell,
  SEPARATOR,
  statusLabel,
  textCell,
} from "@/features/reports/csv";

/**
 * The supplier's spreadsheet of the period: one line per sold item, with what the supplier
 * receives. No store, buyer or sale price: those belong to the reseller (item 38).
 */
const HEADERS = [
  "Data do pedido",
  "Pago em",
  "Pedido",
  "Situação",
  "Conta no período como",
  "Cancelado ou devolvido em",
  "Produto",
  "Código",
  "Quantidade",
  "Valor vendido",
];

type SupplierLineEntry = Pick<SupplierSaleLine, "fromEarlierPeriod" | "status">;

/** What the line is in the period: one of its sales, or the cancellation of an earlier one. */
export function supplierEntryLabel(line: SupplierLineEntry): string {
  if (line.fromEarlierPeriod) {
    return line.status === "returned"
      ? "Devolução de venda anterior"
      : "Cancelamento de venda anterior";
  }
  return "Venda do período";
}

/** Filled only for a paid sale that was cancelled or returned. */
function reversedAtCell(line: Pick<SupplierSaleLine, "reversedAt" | "status">): string {
  if (line.reversedAt === null || (line.status !== "cancelled" && line.status !== "returned")) {
    return "";
  }
  return dateFormatter.format(line.reversedAt);
}

function toCsvLine(line: SupplierSaleLine): string {
  const text = [
    dateFormatter.format(line.orderedAt),
    paidAtCell(line.paidAt),
    line.externalOrderId,
    statusLabel(line.status),
    supplierEntryLabel(line),
    reversedAtCell(line),
    line.title,
    line.sku,
  ].map(textCell);
  return [...text, String(line.quantity), centsToCsv(line.receivableCents)].join(SEPARATOR);
}

export function buildSupplierSalesCsv(lines: readonly SupplierSaleLine[]): string {
  return `${BOM}${[HEADERS.join(SEPARATOR), ...lines.map(toCsvLine)].join("\r\n")}\r\n`;
}
