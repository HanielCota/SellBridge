import { reportPeriodSearchOf, type ReportPeriod } from "@sellbridge/shared/report-period";
import { BOM, centsToCsv, SEPARATOR, textCell } from "@/features/reports/csv";

/*
 * Every spreadsheet download (reseller, supplier, admin) is written the same way as the
 * financial export: `;` between cells, `,` as decimal mark, a BOM for accents in Excel, text
 * cells guarded against formula injection, dates on the Brasília clock.
 */

export type CsvValue =
  | string
  | number
  | null
  | { cents: number }
  | { rate: number | null }
  | { date: Date | null }
  | { day: Date | null };

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
  useGrouping: false,
});

function objectCell(value: Exclude<CsvValue, string | number | null>): string {
  if ("cents" in value) {
    return centsToCsv(Math.round(value.cents));
  }
  if ("rate" in value) {
    return value.rate === null ? "" : decimalFormatter.format(value.rate * 100);
  }
  if ("date" in value) {
    return value.date === null ? "" : dateTimeFormatter.format(value.date);
  }
  return value.day === null ? "" : dayFormatter.format(value.day);
}

function csvCell(value: CsvValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "number") {
    return decimalFormatter.format(value);
  }
  if (typeof value === "string") {
    return textCell(value);
  }
  return objectCell(value);
}

export function buildCsvFile(
  headers: readonly string[],
  rows: readonly (readonly CsvValue[])[],
): string {
  const lines = [headers.map(textCell), ...rows.map((row) => row.map(csvCell))];
  return `${BOM}${lines.map((cells) => cells.join(SEPARATOR)).join("\r\n")}\r\n`;
}

/** "fornecedor-pedidos-2026-10.csv" or "fornecedor-pedidos-2026-10-01-a-2026-10-15.csv". */
export function reportFileName(prefix: string, period: ReportPeriod, extension = "csv"): string {
  const search = reportPeriodSearchOf(period);
  const suffix = "mes" in search ? search.mes : `${search.de}-a-${search.ate}`;
  return `${prefix}-${suffix}.${extension}`;
}

export function csvResponse(fileName: string, body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
