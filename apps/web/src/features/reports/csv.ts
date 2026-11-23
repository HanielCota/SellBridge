import type { OrderFinancialRow } from "@sellbridge/database/repositories";
import { ORDER_STATUS_LABELS, orderStatusSchema } from "@sellbridge/shared/schemas";

/** Excel in pt-BR expects `;` as separator and `,` as decimal mark; the BOM keeps accents. */
export const SEPARATOR = ";";
export const BOM = "﻿";

const HEADERS = [
  "Data do pedido",
  "Pago em",
  "Pedido",
  "Loja",
  "Comprador",
  "Situação",
  "Itens",
  "Receita",
  "Custo do fornecedor",
  "Taxa do marketplace",
  "Reembolsos",
  "Devoluções",
  "Comissões",
  "Lucro",
  "Sem custo informado",
];

export const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
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

export function statusLabel(status: string): string {
  const parsed = orderStatusSchema.safeParse(status);
  return parsed.success ? ORDER_STATUS_LABELS[parsed.data] : status;
}

/** Empty for an order never paid: awaiting payment, or cancelled before paying. */
export function paidAtCell(paidAt: Date | null): string {
  if (paidAt === null) {
    return "";
  }
  return dateFormatter.format(paidAt);
}

function toCsvLine(row: OrderFinancialRow): string {
  const text = [
    dateFormatter.format(row.orderedAt),
    paidAtCell(row.paidAt),
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
  ].map(centsToCsv);
  // A sale of unknown cost has no profit to write: a zero would read as a real result.
  const profit = row.costPending ? "" : centsToCsv(row.profitCents);
  const costPending = row.costPending ? "Sim" : "Não";
  return [...text, ...amounts, profit, costPending].join(SEPARATOR);
}

export function buildFinancialCsv(rows: readonly OrderFinancialRow[]): string {
  return `${BOM}${[HEADERS.join(SEPARATOR), ...rows.map(toCsvLine)].join("\r\n")}\r\n`;
}
