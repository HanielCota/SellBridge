import { validationError } from "../runtime/errors.ts";
import { MAX_PRODUCT_CSV_ROWS } from "../schemas/admin-suppliers.ts";
import type { ImportRecord } from "./supplier-panel-import-table.ts";
import { listZipEntries, readZipText, type ZipEntry } from "./supplier-panel-import-zip.ts";

/**
 * The first sheet of an .xlsx as rows of text cells, each with its Excel row number. Only what a
 * catalog uses is read: shared and inline strings, numbers and booleans; styles are ignored.
 */

const XML_ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};
/** Excel keeps 15 significant digits; more is binary noise ("12.899999999999999"). */
const EXCEL_SIGNIFICANT_DIGITS = 15;
/**
 * The template has a handful of columns; cells past this are ignored, so one cell at column XFD
 * can't make every row 16 thousand cells wide.
 */
const MAX_SHEET_COLUMN = 256;
/** The header plus the product limit; reading stops one row past it. */
const MAX_SHEET_RECORDS = MAX_PRODUCT_CSV_ROWS + 1;
const REPLACEMENT_CHARACTER = "\uFFFD";
const MAX_CODE_POINT = 0x10_ff_ff;

/** A character reference outside Unicode (`&#x110000;`) reads as "�" instead of throwing. */
function codePointText(code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= MAX_CODE_POINT
    ? String.fromCodePoint(code)
    : REPLACEMENT_CHARACTER;
}

function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X")) {
        return codePointText(Number.parseInt(name.slice(2), 16));
      }
      if (name.startsWith("#")) {
        return codePointText(Number.parseInt(name.slice(1), 10));
      }
      return XML_ENTITIES[name] ?? entity;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

interface XmlElement {
  attributes: string;
  body: string;
  start: number;
  end: number;
}

/**
 * The `name` elements of `xml` in one forward pass. A lazy `[\s\S]*?</row>` regex rescans to the
 * end from every unclosed `<row`, so 80 thousand of them in a 785-byte upload held the server
 * for 10 s; here each opening tag looks for its closing tag once, and a missing one is refused.
 */
function* xmlElements(xml: string, name: string): Generator<XmlElement> {
  const opener = new RegExp(`<(?:\\w+:)?${name}\\b([^<>]*)>`, "g");
  const closer = new RegExp(`</(?:\\w+:)?${name}>`, "g");
  for (let open = opener.exec(xml); open !== null; open = opener.exec(xml)) {
    const attributes = open[1] ?? "";
    if (attributes.endsWith("/")) {
      yield {
        attributes: attributes.slice(0, -1),
        body: "",
        start: open.index,
        end: opener.lastIndex,
      };
      continue;
    }
    closer.lastIndex = opener.lastIndex;
    const close = closer.exec(xml);
    if (close === null) {
      throw validationError(
        `A planilha tem uma tag <${name}> sem fechamento; salve de novo como .xlsx ou CSV`,
      );
    }
    yield {
      attributes,
      body: xml.slice(opener.lastIndex, close.index),
      start: open.index,
      end: closer.lastIndex,
    };
    opener.lastIndex = closer.lastIndex;
  }
}

function firstElementBody(xml: string, name: string): string {
  for (const element of xmlElements(xml, name)) {
    return element.body;
  }
  return "";
}

function withoutElements(xml: string, name: string): string {
  const kept: string[] = [];
  let position = 0;
  for (const element of xmlElements(xml, name)) {
    kept.push(xml.slice(position, element.start));
    position = element.end;
  }
  kept.push(xml.slice(position));
  return kept.join("");
}

/** The text runs of a string item, without the phonetic guides Japanese files carry. */
function stringItemText(xml: string): string {
  const withoutPhonetic = withoutElements(xml, "rPh");
  const runs = [...xmlElements(withoutPhonetic, "t")];
  return decodeXml(runs.map((run) => run.body).join(""));
}

function readSharedStrings(xml: string | null): readonly string[] {
  if (xml === null) {
    return [];
  }
  return [...xmlElements(xml, "si")].map((item) => stringItemText(item.body));
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match?.[1] ?? null;
}

/** "B" → 1, "AA" → 26. */
export function columnIndex(letters: string): number {
  return (
    letters
      .toUpperCase()
      .split("")
      .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1
  );
}

function numberText(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return raw;
  }
  return String(Number(value.toPrecision(EXCEL_SIGNIFICANT_DIGITS)));
}

function cellText(attributes: string, body: string, shared: readonly string[]): string {
  const type = attribute(attributes, "t");
  if (type === "inlineStr") {
    return stringItemText(body);
  }
  const value = decodeXml(firstElementBody(body, "v"));
  if (type === "s") {
    return shared[Number(value)] ?? "";
  }
  if (type === "str" || type === "e" || type === "b") {
    return value;
  }
  return value === "" ? "" : numberText(value);
}

function readRow(rowXml: string, shared: readonly string[]): string[] {
  const cells: string[] = [];
  for (const cell of xmlElements(rowXml, "c")) {
    const attributes = cell.attributes;
    const reference = /^([A-Z]+)\d*$/i.exec(attribute(attributes, "r") ?? "");
    const index = reference?.[1] === undefined ? cells.length : columnIndex(reference[1]);
    if (index >= MAX_SHEET_COLUMN) {
      continue;
    }
    const text = cellText(attributes, cell.body, shared);
    // An empty cell adds nothing: the row is padded to the header's width later.
    if (text === "" && index >= cells.length) {
      continue;
    }
    while (cells.length < index) {
      cells.push("");
    }
    cells[index] = text;
  }
  return cells;
}

function firstSheetPath(bytes: Uint8Array, entries: ReadonlyMap<string, ZipEntry>): string {
  const workbook = readZipText(bytes, entries, "xl/workbook.xml") ?? "";
  const relations = readZipText(bytes, entries, "xl/_rels/workbook.xml.rels") ?? "";
  const sheet = /<(?:\w+:)?sheet\b([^>]*)\/?>/.exec(workbook)?.[1] ?? "";
  const relationId = attribute(sheet, "r:id");
  const relation = [...relations.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)]
    .map((match) => match[1] ?? "")
    .find((attributes) => attribute(attributes, "Id") === relationId);
  const target = relation === undefined ? null : attribute(relation, "Target");
  if (target === null) {
    return "xl/worksheets/sheet1.xml";
  }
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

/** Rows of the first sheet; blank rows are skipped but every row keeps its Excel number. */
export function readFirstSheetRecords(bytes: Uint8Array): ImportRecord[] {
  const entries = listZipEntries(bytes);
  const sheet = readZipText(bytes, entries, firstSheetPath(bytes, entries));
  if (sheet === null) {
    throw validationError("A planilha não tem aba com dados; preencha a primeira aba");
  }
  const shared = readSharedStrings(readZipText(bytes, entries, "xl/sharedStrings.xml"));
  const records: ImportRecord[] = [];
  let position = 0;
  for (const row of xmlElements(sheet, "row")) {
    position += 1;
    const number = Number(attribute(row.attributes, "r") ?? position);
    const fields = readRow(row.body, shared);
    if (!fields.some((field) => field.trim().length > 0)) {
      continue;
    }
    // Stop here rather than read a huge sheet only to refuse it afterwards.
    if (records.length === MAX_SHEET_RECORDS) {
      throw validationError(
        `A planilha tem mais de ${MAX_PRODUCT_CSV_ROWS} produtos e o limite é ${MAX_PRODUCT_CSV_ROWS}; divida em partes menores`,
      );
    }
    records.push({ line: number, fields, structuralError: null });
  }
  return records;
}
