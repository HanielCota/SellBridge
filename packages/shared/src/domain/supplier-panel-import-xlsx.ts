import { validationError } from "../runtime/errors.ts";
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
const MAX_SHEET_COLUMN = 16_384;

function decodeXml(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      }
      if (name.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      }
      return XML_ENTITIES[name] ?? entity;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

/** The text runs of a string item, without the phonetic guides Japanese files carry. */
function stringItemText(xml: string): string {
  const withoutPhonetic = xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "");
  const runs = [...withoutPhonetic.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)];
  return decodeXml(runs.map((run) => run[1] ?? "").join(""));
}

function readSharedStrings(xml: string | null): readonly string[] {
  if (xml === null) {
    return [];
  }
  return [...xml.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((item) =>
    stringItemText(item[1] ?? ""),
  );
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
  const value = decodeXml(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1] ?? "");
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
  const pattern = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
  for (const cell of rowXml.matchAll(pattern)) {
    const attributes = cell[1] ?? "";
    const reference = /^([A-Z]+)\d*$/i.exec(attribute(attributes, "r") ?? "");
    const index = reference?.[1] === undefined ? cells.length : columnIndex(reference[1]);
    if (index >= MAX_SHEET_COLUMN) {
      continue;
    }
    while (cells.length < index) {
      cells.push("");
    }
    cells[index] = cellText(attributes, cell[2] ?? "", shared);
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
  const rows = [...sheet.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)];
  const records: ImportRecord[] = [];
  for (const [position, row] of rows.entries()) {
    const number = Number(attribute(row[1] ?? "", "r") ?? position + 1);
    const fields = readRow(row[2] ?? "", shared);
    if (fields.some((field) => field.trim().length > 0)) {
      records.push({ line: number, fields, structuralError: null });
    }
  }
  return records;
}
