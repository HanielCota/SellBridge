import type { SupplierSaleLine } from "@sellbridge/database/repositories";
import {
  BOM,
  centsToCsv,
  dateFormatter,
  SEPARATOR,
  statusLabel,
  textCell,
} from "@/features/reports/csv";

/**
 * The supplier's spreadsheet of the period: one line per sold item, with what the supplier
 * receives. No store, buyer or sale price: those belong to the reseller (item 38).
 */
const HEADERS = ["Data", "Pedido", "Situação", "Produto", "Código", "Quantidade", "A receber"];

function toCsvLine(line: SupplierSaleLine): string {
  const text = [
    dateFormatter.format(line.orderedAt),
    line.externalOrderId,
    statusLabel(line.status),
    line.title,
    line.sku,
  ].map(textCell);
  return [...text, String(line.quantity), centsToCsv(line.receivableCents)].join(SEPARATOR);
}

export function buildSupplierSalesCsv(lines: readonly SupplierSaleLine[]): string {
  return `${BOM}${[HEADERS.join(SEPARATOR), ...lines.map(toCsvLine)].join("\r\n")}\r\n`;
}
