import type { OrderFinancialRow } from "@sellbridge/db/repositories";
import { ORDER_STATUS_LABELS, orderStatusSchema } from "@sellbridge/shared/schemas";

/** Excel in pt-BR expects `;` as separator and `,` as decimal mark; the BOM keeps accents. */
const SEPARATOR = ";";
const BOM = "﻿";

const HEADERS = [
  "Data",
  "Pedido",
  "Loja",
  "Comprador",
  "Status",
  "Itens",
  "Receita",
  "Custo do fornecedor",
  "Taxa do marketplace",
  "Reembolsos",
  "Devoluções",
  "Comissões",
  "Taxa da plataforma",
  "Lucro",
];

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\n\r]/;

/** Text cells: neutralize spreadsheet formula injection first, then quote when needed. */
export function textCell(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (!NEEDS_QUOTES.test(safe)) {
    return safe;
  }
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Numeric cells are written raw (never escaped), e.g. -1234,56. */
export function centsToCsv(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)},${String(absolute % 100).padStart(2, "0")}`;
}

function statusLabel(status: string): string {
  const parsed = orderStatusSchema.safeParse(status);
  return parsed.success ? ORDER_STATUS_LABELS[parsed.data] : status;
}

function toCsvLine(row: OrderFinancialRow): string {
  const text = [
    dateFormatter.format(row.orderedAt),
    row.externalOrderId,
    row.storeName,
    row.buyerName ?? "",
    statusLabel(row.status),
    row.items,
  ].map(textCell);
  const amounts = [
    row.revenueCents,
    row.costCents,
    row.feeCents,
    row.refundCents,
    row.returnCents,
    row.commissionCents,
    row.platformFeeCents,
    row.profitCents,
  ].map(centsToCsv);
  return [...text, ...amounts].join(SEPARATOR);
}

export function buildFinancialCsv(rows: readonly OrderFinancialRow[]): string {
  return `${BOM}${[HEADERS.join(SEPARATOR), ...rows.map(toCsvLine)].join("\r\n")}\r\n`;
}
