import { productExportRow, type ProductExportSource } from "./supplier-panel-export.ts";
import { IMPORT_COLUMNS, IMPORT_ERROR_COLUMN } from "./supplier-panel-import-columns.ts";
import type { ImportRowIssues, ImportTableShape } from "./supplier-panel-import-issues.ts";
import { type ImportRecord, serializeSemicolonRow } from "./supplier-panel-import-table.ts";

/**
 * The files the supplier downloads. All open in Excel with accents intact (UTF-8 BOM, ";" and
 * CRLF, the Brazilian Excel defaults) and all can be imported back as they are.
 */

const BOM = "\uFEFF";
const EXCEL_LINE_BREAK = "\r\n";
const ISSUE_SEPARATOR = " | ";

/** The template's first line; the product export starts with the same one. */
const IMPORT_HEADER: readonly string[] = IMPORT_COLUMNS.map((entry) => entry.column);

function excelLines(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => `${serializeSemicolonRow(row)}${EXCEL_LINE_BREAK}`).join("");
}

function excelCsv(rows: readonly (readonly string[])[]): string {
  return `${BOM}${excelLines(rows)}`;
}

/** Every column, plus one example product; the category is a real one when the platform has any. */
export function buildImportTemplateCsv(categorySlug: string | null): string {
  const example = IMPORT_COLUMNS.map((entry) =>
    entry.column === "categoria" ? (categorySlug ?? "") : entry.example,
  );
  return excelCsv([IMPORT_HEADER, example]);
}

/** How the product export starts: the BOM and the template's header. */
export function productExportStart(): string {
  return excelCsv([IMPORT_HEADER]);
}

/** One line per product, sent in batches after `productExportStart`. */
export function productExportLines(products: readonly ProductExportSource[]): string {
  return excelLines(products.map(productExportRow));
}

/** The supplier's products in the template's format, ready to edit and import back. */
export function buildProductExportCsv(products: readonly ProductExportSource[]): string {
  return `${productExportStart()}${productExportLines(products)}`;
}

/** What each column takes, then the category identifiers the "categoria" column accepts. */
export function buildImportGuideCsv(
  categories: readonly { readonly name: string; readonly slug: string }[],
): string {
  const columns = IMPORT_COLUMNS.map((entry) => [
    entry.column,
    entry.required ? "sim" : "não",
    entry.format,
    entry.example,
  ]);
  const categoryRows = categories.map((category) => [category.slug, category.name, "", ""]);
  return excelCsv([
    ["coluna", "obrigatória", "formato", "exemplo"],
    ...columns,
    ["", "", "", ""],
    ["categoria (identificador)", "nome", "", ""],
    ...categoryRows,
  ]);
}

/**
 * Only the rows that failed, as the supplier wrote them, with the reason in a first "erro"
 * column. After fixing, the same file is imported again: the import ignores "erro".
 */
export function buildFailedRowsCsv(
  shape: ImportTableShape,
  records: ReadonlyMap<number, ImportRecord>,
  rows: readonly ImportRowIssues[],
): string {
  const failed = rows.map((row) => [
    row.issues.map((issue) => issue.message).join(ISSUE_SEPARATOR),
    ...(records.get(row.line)?.fields ?? []),
  ]);
  return excelCsv([[IMPORT_ERROR_COLUMN, ...shape.header], ...failed]);
}

/** Header plus the rows not in `failedLines`: what "importar só as válidas" sends to product-csv. */
export function buildValidRowsCsv(
  shape: ImportTableShape,
  records: ReadonlyMap<number, ImportRecord>,
  failedLines: ReadonlySet<number>,
): { content: string; rowCount: number } {
  const valid = [...records.values()].filter(
    (record) => record.structuralError === null && !failedLines.has(record.line),
  );
  const lines = [shape.header, ...valid.map((record) => record.fields)].map((row) =>
    serializeSemicolonRow(row),
  );
  return { content: `${lines.join("\n")}\n`, rowCount: valid.length };
}
