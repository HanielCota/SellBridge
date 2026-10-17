import { validationError } from "../runtime/errors.ts";
import { MAX_PRODUCT_CSV_BYTES, MAX_PRODUCT_CSV_ROWS } from "../schemas/admin-suppliers.ts";
import { decodeImportText, type ImportTextEncoding } from "./supplier-panel-import-decode.ts";
import { checkImportHeader } from "./supplier-panel-import-header.ts";
import type { ImportTableShape } from "./supplier-panel-import-issues.ts";
import {
  detectDelimiter,
  type ImportDelimiter,
  type ImportRecord,
  readDelimitedRecords,
  serializeSemicolonRow,
} from "./supplier-panel-import-table.ts";
import { readFirstSheetRecords } from "./supplier-panel-import-xlsx.ts";
import { looksLikeZip } from "./supplier-panel-import-zip.ts";

/**
 * Server only (reads .xlsx with node:zlib). Puts any spreadsheet the supplier has (CSV in
 * UTF-8 or Windows-1252, with ";", "," or tab; or .xlsx) into the one shape product-csv reads,
 * and remembers which line of the original file each product came from.
 */

export type ImportFileFormat = "csv" | "xlsx";

export interface NormalizedImport extends ImportTableShape {
  readonly format: ImportFileFormat;
  readonly encoding: ImportTextEncoding | null;
  readonly delimiter: ImportDelimiter | null;
  /** Product rows (no header), cells aligned to `header`, by their line in the original file. */
  readonly records: ReadonlyMap<number, ImportRecord>;
  /** Header plus every row that could be split into cells, as product-csv expects. */
  readonly canonicalCsv: string;
  /** Line in `canonicalCsv` → line in the original file. */
  readonly originalLines: ReadonlyMap<number, number>;
}

interface RawTable {
  readonly format: ImportFileFormat;
  readonly encoding: ImportTextEncoding | null;
  readonly delimiter: ImportDelimiter | null;
  readonly records: readonly ImportRecord[];
}

function readRawTable(bytes: Uint8Array): RawTable {
  if (looksLikeZip(bytes)) {
    return {
      format: "xlsx",
      encoding: null,
      delimiter: null,
      records: readFirstSheetRecords(bytes),
    };
  }
  const { text, encoding } = decodeImportText(bytes);
  const delimiter = detectDelimiter(text);
  return { format: "csv", encoding, delimiter, records: readDelimitedRecords(text, delimiter) };
}

function withoutTrailingBlanks(fields: readonly string[], width: number): string[] {
  const kept = [...fields];
  while (kept.length > width && (kept.at(-1) ?? "").trim().length === 0) {
    kept.pop();
  }
  return kept;
}

/** Excel leaves out empty cells at the end of a row; a CSV row with fewer cells stays an error. */
function alignRecord(
  record: ImportRecord,
  table: { width: number; skipped: number; format: ImportFileFormat },
): ImportRecord {
  const fields = record.fields.filter((_field, index) => index !== table.skipped);
  const trimmed = withoutTrailingBlanks(fields, table.width);
  const padding =
    table.format === "xlsx"
      ? Array.from({ length: Math.max(0, table.width - trimmed.length) }, () => "")
      : [];
  return { ...record, fields: [...trimmed, ...padding] };
}

function buildCanonicalCsv(header: readonly string[], records: readonly ImportRecord[]) {
  const lines = [serializeSemicolonRow(header)];
  const originalLines = new Map<number, number>();
  let nextLine = 2;
  for (const record of records) {
    if (record.structuralError !== null) {
      continue;
    }
    const row = serializeSemicolonRow(record.fields);
    originalLines.set(nextLine, record.line);
    lines.push(row);
    nextLine += 1 + (row.match(/\n/g)?.length ?? 0);
  }
  return { canonicalCsv: `${lines.join("\n")}\n`, originalLines };
}

export function normalizeImportFile(bytes: Uint8Array): NormalizedImport {
  if (bytes.byteLength === 0) {
    throw validationError("O arquivo está vazio; escolha a planilha com os produtos");
  }
  if (bytes.byteLength > MAX_PRODUCT_CSV_BYTES) {
    throw validationError("O arquivo passa de 2 MB; divida a planilha em partes menores");
  }
  const raw = readRawTable(bytes);
  const [headerRecord, ...rows] = raw.records;
  if (headerRecord === undefined) {
    throw validationError("O arquivo está vazio; escolha a planilha com os produtos");
  }
  const checked = checkImportHeader(headerRecord.fields);
  if (rows.length === 0) {
    throw validationError(
      "A planilha tem só o cabeçalho; preencha os produtos a partir da linha 2",
    );
  }
  if (rows.length > MAX_PRODUCT_CSV_ROWS) {
    throw validationError(
      `A planilha tem ${rows.length} produtos e o limite é ${MAX_PRODUCT_CSV_ROWS}; divida em partes menores`,
    );
  }
  const table = { width: checked.header.length, skipped: checked.skippedIndex, format: raw.format };
  const records = rows.map((record) => alignRecord(record, table));
  const canonical = buildCanonicalCsv(checked.header, records);
  if (new TextEncoder().encode(canonical.canonicalCsv).byteLength > MAX_PRODUCT_CSV_BYTES) {
    throw validationError(
      "A planilha passa de 2 MB depois de convertida; divida em partes menores",
    );
  }
  return {
    format: raw.format,
    encoding: raw.encoding,
    delimiter: raw.delimiter,
    header: checked.header,
    letters: checked.letters,
    records: new Map(records.map((record) => [record.line, record])),
    ...canonical,
  };
}
