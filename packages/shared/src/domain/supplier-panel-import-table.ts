import { validationError } from "../runtime/errors.ts";
import { MAX_PRODUCT_CSV_ROWS } from "../schemas/admin-suppliers.ts";

/**
 * A spreadsheet read as rows of cells, before the product rules look at it. Every row keeps the
 * line the person sees in their editor (or the Excel row number), so an error points at it.
 */
export interface ImportRecord {
  readonly line: number;
  readonly fields: readonly string[];
  /** Broken quotes: the row cannot be split into cells reliably. */
  readonly structuralError: "unclosed-quote" | "stray-quote" | null;
}

export type ImportDelimiter = ";" | "," | "\t";

const DELIMITERS: readonly ImportDelimiter[] = [";", ",", "\t"];
/** Same ceiling as product-csv: one line of delimiters must not become millions of cells. */
export const MAX_IMPORT_COLUMNS = 50;

export const IMPORT_DELIMITER_LABELS: Readonly<Record<ImportDelimiter, string>> = {
  ";": "ponto e vírgula",
  ",": "vírgula",
  "\t": "tabulação",
};

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (const character of line) {
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

/** The delimiter used most in the header line; ";" (the template's) when none appears. */
export function detectDelimiter(text: string): ImportDelimiter {
  const header = text.split("\n").find((line) => line.trim().length > 0) ?? "";
  const counts = DELIMITERS.map((delimiter) => ({
    delimiter,
    count: countOutsideQuotes(header, delimiter),
  }));
  const best = counts.toSorted((first, second) => second.count - first.count)[0];
  if (best === undefined || best.count === 0) {
    return ";";
  }
  return best.delimiter;
}

interface Cursor {
  readonly fields: readonly string[];
  readonly field: string;
  readonly quoted: boolean;
  readonly closed: boolean;
  readonly error: ImportRecord["structuralError"];
  readonly line: number;
  readonly startLine: number;
}

interface Step {
  readonly cursor: Cursor;
  readonly record: ImportRecord | null;
  /** Characters consumed beyond the current one (an escaped quote takes two). */
  readonly skip: number;
}

const START: Cursor = {
  fields: [],
  field: "",
  quoted: false,
  closed: false,
  error: null,
  line: 1,
  startLine: 1,
};

function step(cursor: Cursor, record: ImportRecord | null = null, skip = 0): Step {
  return { cursor, record, skip };
}

function closeField(cursor: Cursor): Cursor {
  if (cursor.fields.length >= MAX_IMPORT_COLUMNS) {
    throw validationError(
      `A linha ${cursor.startLine} tem mais de ${MAX_IMPORT_COLUMNS} colunas; confira o separador`,
    );
  }
  return { ...cursor, fields: [...cursor.fields, cursor.field], field: "", closed: false };
}

/** The finished row (null when blank) and a cursor at the start of the next line. */
function closeRecord(cursor: Cursor): Step {
  const closed = closeField(cursor);
  const blank = closed.fields.every((field) => field.trim().length === 0);
  const record =
    blank && closed.error === null
      ? null
      : { line: closed.startLine, fields: closed.fields, structuralError: closed.error };
  const next = { ...closed, fields: [], error: null, line: closed.line + 1 };
  return step({ ...next, startLine: next.line }, record);
}

function readQuoted(cursor: Cursor, character: string, next: string | undefined): Step {
  if (character === '"' && next === '"') {
    return step({ ...cursor, field: `${cursor.field}"` }, null, 1);
  }
  if (character === '"') {
    return step({ ...cursor, quoted: false, closed: true });
  }
  const line = cursor.line + (character === "\n" ? 1 : 0);
  return step({ ...cursor, field: cursor.field + character, line });
}

function readUnquoted(cursor: Cursor, character: string, delimiter: string): Step {
  if (character === delimiter) {
    return step(closeField(cursor));
  }
  if (character === "\n") {
    return closeRecord(cursor);
  }
  if (character === '"' && cursor.field.trim().length === 0 && !cursor.closed) {
    return step({ ...cursor, quoted: true, field: "" });
  }
  const stray = character === '"' || (cursor.closed && character.trim().length > 0);
  const error = stray ? "stray-quote" : cursor.error;
  return step({ ...cursor, error, field: cursor.field + character });
}

/** RFC 4180 cells with any delimiter; quotes may wrap delimiters and line breaks. */
export function readDelimitedRecords(text: string, delimiter: ImportDelimiter): ImportRecord[] {
  const content = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const records: ImportRecord[] = [];
  let cursor = START;
  for (let index = 0; index <= content.length; index += 1) {
    const character = content[index];
    const result = readCharacter(cursor, character, content[index + 1], delimiter);
    cursor = result.cursor;
    index += result.skip;
    if (result.record !== null) {
      records.push(result.record);
    }
    if (records.length > MAX_PRODUCT_CSV_ROWS + 1) {
      throw validationError(
        `O arquivo passa de ${MAX_PRODUCT_CSV_ROWS} produtos; divida em partes menores`,
      );
    }
  }
  return records;
}

/** `undefined` is the end of the text: it closes the last row, flagging an open quote. */
function readCharacter(
  cursor: Cursor,
  character: string | undefined,
  next: string | undefined,
  delimiter: ImportDelimiter,
): Step {
  if (character === undefined) {
    return closeRecord(cursor.quoted ? { ...cursor, error: "unclosed-quote" } : cursor);
  }
  if (cursor.quoted) {
    return readQuoted(cursor, character, next);
  }
  return readUnquoted(cursor, character, delimiter);
}

function quoteCell(cell: string): string {
  if (!/[;"\n]/.test(cell)) {
    return cell;
  }
  return `"${cell.replaceAll('"', '""')}"`;
}

/** One row in the shape product-csv reads: ";" between cells, quotes only where needed. */
export function serializeSemicolonRow(fields: readonly string[]): string {
  return fields.map((field) => quoteCell(field.trim())).join(";");
}
