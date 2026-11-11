import { validationError } from "./errors.ts";

/**
 * Minimal reader for the cell text of .xlsx workbooks (Office Open XML).
 * It reads values only; formulas, styles and dates are not interpreted.
 * Built on the platform's DecompressionStream, so it runs in browsers and Node without a dependency.
 */

export interface XlsxSheet {
  readonly name: string;
  /** Rows by spreadsheet position: index 0 is row 1. Missing cells are empty strings. */
  readonly rows: readonly (readonly string[])[];
}

export const MAX_XLSX_BYTES = 20 * 1024 * 1024;
const MAX_ENTRY_BYTES = 100 * 1024 * 1024;
/** Inflated XML read across the whole workbook: sheets listed many times cannot multiply the work. */
const MAX_WORKBOOK_XML_CHARACTERS = 200 * 1024 * 1024;
const MAX_SHEETS = 100;
/** Workbook relationships: sheets plus a handful of styles, theme and shared-string parts. */
const MAX_RELATIONSHIPS = 1_000;
const MAX_ROWS = 50_000;
const MAX_COLUMNS = 500;
/** Cells kept across all sheets, padding included: a few KB of `<c r="SE"/>` rows would hold millions. */
const MAX_WORKBOOK_CELLS = 5_000_000;
/** Shared string items read: `<si/>` costs 5 characters, so the XML budget alone allowed 40 million, each read at a cost. */
const MAX_SHARED_STRINGS = 200_000;
/**
 * The shared-string cap for a workbook read in the admin's browser: there a large file only slows
 * the admin's own tab, and a listing export of 20 MiB can hold more unique texts than the server cap.
 */
export const BROWSER_MAX_SHARED_STRINGS = MAX_WORKBOOK_CELLS;
const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const END_OF_DIRECTORY_SIZE = 22;
const MAX_ZIP_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

interface ZipEntry {
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

const invalidWorkbook = () => validationError("Planilha .xlsx inválida ou corrompida");
const tooLarge = () => validationError("A planilha .xlsx é grande demais para importar");

function findEndOfDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - END_OF_DIRECTORY_SIZE - MAX_ZIP_COMMENT);
  for (let offset = view.byteLength - END_OF_DIRECTORY_SIZE; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw invalidWorkbook();
}

function readDirectory(bytes: Uint8Array<ArrayBuffer>): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfDirectory(view);
  const entryCount = view.getUint16(end + 10, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let offset = view.getUint32(end + 16, true);
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.byteLength) {
      throw invalidWorkbook();
    }

    if (view.getUint32(offset, true) !== DIRECTORY_ENTRY_SIGNATURE) {
      throw invalidWorkbook();
    }

    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      localHeaderOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(data: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge();
    }

    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.byteLength;
  }
  return output;
}

/**
 * Inflates one entry, refusing it past `limit` bytes. The caller passes what is left of the
 * workbook budget, so entries are read one at a time and never hold more than the budget at once.
 */
async function readEntry(
  bytes: Uint8Array<ArrayBuffer>,
  entry: ZipEntry,
  limit: number,
): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;
  if (header + 30 > bytes.byteLength) {
    throw invalidWorkbook();
  }

  if (view.getUint32(header, true) !== LOCAL_HEADER_SIGNATURE) {
    throw invalidWorkbook();
  }

  if (entry.uncompressedSize > limit) {
    throw tooLarge();
  }

  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (data.byteLength !== entry.compressedSize) {
    throw invalidWorkbook();
  }

  const decoder = new TextDecoder();
  if (entry.method === STORED) {
    if (data.byteLength > limit) {
      throw tooLarge();
    }
    return decoder.decode(data);
  }

  if (entry.method === DEFLATED) {
    return decoder.decode(await inflate(data, limit));
  }

  throw validationError("A planilha .xlsx usa uma compressão não suportada");
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return safeCodePoint(Number.parseInt(entity.slice(2), 16), match);
    }

    if (entity.startsWith("#")) {
      return safeCodePoint(Number.parseInt(entity.slice(1), 10), match);
    }

    return XML_ENTITIES[entity] ?? match;
  });
}

function safeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }
  return String.fromCodePoint(codePoint);
}

/**
 * `name="value"` pairs of an opening tag. The attempt is anchored where the previous token ended and
 * a failed one skips its whole word: an unanchored search retried every position inside a long run
 * of letters with no `=`, and a 1 KB upload held the server for minutes.
 */
function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pair = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
  const skipped = /[\w:.-]+|[^\w:.-]/y;
  let position = 0;
  while (position < tag.length) {
    pair.lastIndex = position;
    const match = pair.exec(tag);
    if (match === null) {
      skipped.lastIndex = position;
      skipped.exec(tag);
      position = skipped.lastIndex;
      continue;
    }

    const name = (match[1] ?? "").replace(/^[\w.-]+:/, "");
    attributes.set(name, decodeXml(match[2] ?? match[3] ?? ""));
    position = pair.lastIndex;
  }
  return attributes;
}

interface XmlElement {
  readonly attributes: string;
  readonly body: string;
  readonly start: number;
  readonly end: number;
}

/**
 * `<prefix:tag ...>...</prefix:tag>` and self-closing `<tag/>`, with any namespace prefix, in one
 * forward pass. A lazy `[\s\S]*?</tag>` regex rescans to the end from every unclosed opener, so a
 * small upload full of `<row>` held the server for seconds; here each opener looks for its closer
 * once, and a missing closer is refused.
 */
function* scanElements(xml: string, tag: string): Generator<XmlElement> {
  const opener = new RegExp(`<(?:[\\w.-]+:)?${tag}(\\s[^<>]*?)?(/?)>`, "g");
  const closer = new RegExp(`</(?:[\\w.-]+:)?${tag}>`, "g");
  for (let open = opener.exec(xml); open !== null; open = opener.exec(xml)) {
    const attributes = open[1] ?? "";
    if (open[2] === "/") {
      yield { attributes, body: "", start: open.index, end: opener.lastIndex };
      continue;
    }

    closer.lastIndex = opener.lastIndex;
    const close = closer.exec(xml);
    if (close === null) {
      throw validationError(
        `A planilha tem uma tag <${tag}> sem fechamento; salve de novo como .xlsx`,
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

/** Elements read lazily and refused past `max`, before a flood of tiny tags is held in memory. */
function boundedElements(
  xml: string,
  tag: string,
  max: number,
  tooMany: () => Error,
): XmlElement[] {
  const found: XmlElement[] = [];
  for (const element of scanElements(xml, tag)) {
    if (found.length === max) {
      throw tooMany();
    }
    found.push(element);
  }
  return found;
}

function firstElement(xml: string, tag: string): XmlElement | undefined {
  for (const element of scanElements(xml, tag)) {
    return element;
  }
  return undefined;
}

function withoutElements(xml: string, tag: string): string {
  const kept: string[] = [];
  let position = 0;
  for (const element of scanElements(xml, tag)) {
    kept.push(xml.slice(position, element.start));
    position = element.end;
  }
  kept.push(xml.slice(position));
  return kept.join("");
}

/** Text of `<t>` runs, ignoring phonetic hints (`<rPh>`). */
function richText(xml: string): string {
  let text = "";
  for (const element of scanElements(withoutElements(xml, "rPh"), "t")) {
    text += decodeXml(element.body);
  }
  return text;
}

function columnIndex(reference: string | undefined, fallback: number): number {
  const letters = /^([A-Z]+)\d*$/i.exec(reference ?? "")?.[1];
  if (letters == null) {
    return fallback;
  }

  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

const CELL_READERS: Record<string, (body: string, shared: readonly string[]) => string> = {
  // "s" is the cell type of the shared string table.
  ["s"]: (body, shared) => shared[Number.parseInt(cellValue(body), 10)] ?? "",
  inlineStr: (body) => richText(firstElement(body, "is")?.body ?? ""),
};

function cellValue(body: string): string {
  return decodeXml(firstElement(body, "v")?.body ?? "");
}

const tooManyColumns = () => validationError(`A planilha aceita no máximo ${MAX_COLUMNS} colunas`);

function parseRow(xml: string, shared: readonly string[]): string[] {
  const values: string[] = [];
  for (const cell of boundedElements(xml, "c", MAX_COLUMNS, tooManyColumns)) {
    const attributes = parseAttributes(cell.attributes);
    const column = columnIndex(attributes.get("r"), values.length);
    if (column >= MAX_COLUMNS) {
      throw validationError(`A planilha aceita no máximo ${MAX_COLUMNS} colunas`);
    }

    const read = CELL_READERS[attributes.get("t") ?? ""] ?? cellValue;
    while (values.length < column) {
      values.push("");
    }
    values[column] = read(cell.body, shared);
  }
  return values;
}

const tooManyCells = () => validationError("A planilha .xlsx tem células demais para importar");

/** Rows of one sheet; `cellsBefore` counts the cells the sheets read earlier already hold. */
function parseSheet(
  xml: string,
  shared: readonly string[],
  cellsBefore: number,
): { rows: string[][]; cells: number } {
  const rows: string[][] = [];
  let cells = cellsBefore;
  for (const row of scanElements(xml, "row")) {
    const rowNumber = Number.parseInt(parseAttributes(row.attributes).get("r") ?? "", 10);
    const index = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length;
    if (index >= MAX_ROWS) {
      throw validationError(`A planilha aceita no máximo ${MAX_ROWS} linhas`);
    }

    // Skipped rows are kept as empty arrays, so they count against the cell budget too.
    cells += Math.max(0, index - rows.length);
    if (cells > MAX_WORKBOOK_CELLS) {
      throw tooManyCells();
    }
    while (rows.length < index) {
      rows.push([]);
    }
    const values = parseRow(row.body, shared);
    rows[index] = values;
    cells += values.length;
    if (cells > MAX_WORKBOOK_CELLS) {
      throw tooManyCells();
    }
  }
  return { rows, cells };
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  return `xl/${target}`;
}

async function readOptionalEntry(
  bytes: Uint8Array<ArrayBuffer>,
  entries: Map<string, ZipEntry>,
  name: string,
  limit: number,
): Promise<string | null> {
  const entry = entries.get(name);
  if (entry == null) {
    return null;
  }
  return await readEntry(bytes, entry, limit);
}

async function readRequiredEntry(
  bytes: Uint8Array<ArrayBuffer>,
  entries: Map<string, ZipEntry>,
  name: string,
  limit: number,
): Promise<string> {
  const content = await readOptionalEntry(bytes, entries, name, limit);
  if (content == null) {
    throw invalidWorkbook();
  }
  return content;
}

/**
 * Cell text of every sheet in the workbook.
 *
 * @param options.maxSharedStrings - Shared strings accepted; the server default unless the reader
 * runs in the browser.
 * @throws {AppError} VALIDATION when the file is not a readable .xlsx or passes a size limit.
 */
export async function readXlsxSheets(
  bytes: Uint8Array<ArrayBuffer>,
  options: { readonly maxSharedStrings?: number } = {},
): Promise<XlsxSheet[]> {
  if (bytes.byteLength > MAX_XLSX_BYTES) {
    throw validationError("A planilha .xlsx deve ter no máximo 20 MiB");
  }

  const entries = readDirectory(bytes);
  const workbook = await readRequiredEntry(bytes, entries, "xl/workbook.xml", entryLimit(0));
  let xmlCharacters = workbook.length;
  const relationships = await readRequiredEntry(
    bytes,
    entries,
    "xl/_rels/workbook.xml.rels",
    entryLimit(xmlCharacters),
  );
  xmlCharacters += relationships.length;
  const sharedXml =
    (await readOptionalEntry(bytes, entries, "xl/sharedStrings.xml", entryLimit(xmlCharacters))) ??
    "";
  xmlCharacters += sharedXml.length;
  const shared = readSharedStrings(sharedXml, options.maxSharedStrings ?? MAX_SHARED_STRINGS);
  const targets = new Map(
    boundedElements(relationships, "Relationship", MAX_RELATIONSHIPS, tooLarge).map(
      (relationship) => {
        const attributes = parseAttributes(relationship.attributes);
        return [attributes.get("Id") ?? "", resolveTarget(attributes.get("Target") ?? "")];
      },
    ),
  );
  const listed = boundedElements(workbook, "sheet", MAX_SHEETS, () =>
    validationError(`A planilha aceita no máximo ${MAX_SHEETS} abas`),
  );

  const sheets: XlsxSheet[] = [];
  let cells = 0;
  for (const sheet of listed) {
    const attributes = parseAttributes(sheet.attributes);
    const path = targets.get(attributes.get("id") ?? "");
    if (path == null) {
      continue;
    }

    const xml = await readRequiredEntry(bytes, entries, path, entryLimit(xmlCharacters));
    xmlCharacters += xml.length;
    const parsed = parseSheet(xml, shared, cells);
    cells = parsed.cells;
    sheets.push({ name: attributes.get("name") ?? "", rows: parsed.rows });
  }
  return sheets;
}

/**
 * What the next entry may inflate to: the rest of the workbook budget, at most one entry's cap.
 * This is where the budget is enforced: decoding never yields more characters than bytes.
 */
function entryLimit(readSoFar: number): number {
  return Math.min(MAX_ENTRY_BYTES, MAX_WORKBOOK_XML_CHARACTERS - readSoFar);
}

function readSharedStrings(xml: string, maxSharedStrings: number): string[] {
  const shared: string[] = [];
  for (const item of scanElements(xml, "si")) {
    if (shared.length === maxSharedStrings) {
      throw tooManyCells();
    }
    shared.push(richText(item.body));
  }
  return shared;
}
