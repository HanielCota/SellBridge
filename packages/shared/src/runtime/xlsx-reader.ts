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
const MAX_ROWS = 50_000;
const MAX_COLUMNS = 500;
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
      throw validationError("A planilha .xlsx é grande demais para importar");
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

async function readEntry(bytes: Uint8Array<ArrayBuffer>, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;
  if (header + 30 > bytes.byteLength) {
    throw invalidWorkbook();
  }

  if (view.getUint32(header, true) !== LOCAL_HEADER_SIGNATURE) {
    throw invalidWorkbook();
  }

  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw validationError("A planilha .xlsx é grande demais para importar");
  }

  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (data.byteLength !== entry.compressedSize) {
    throw invalidWorkbook();
  }

  const decoder = new TextDecoder();
  if (entry.method === STORED) {
    return decoder.decode(data);
  }

  if (entry.method === DEFLATED) {
    return decoder.decode(await inflate(data, MAX_ENTRY_BYTES));
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

function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const name = (match[1] ?? "").replace(/^[\w.-]+:/, "");
    attributes.set(name, decodeXml(match[2] ?? match[3] ?? ""));
  }
  return attributes;
}

/** Matches `<prefix:tag ...>...</prefix:tag>` and self-closing `<tag/>`, with any namespace prefix. */
function elements(xml: string, tag: string): { attributes: string; body: string }[] {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${tag}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>)`,
    "g",
  );
  return Array.from(xml.matchAll(pattern), (match) => ({
    attributes: match[1] ?? "",
    body: match[2] ?? "",
  }));
}

/** Text of `<t>` runs, ignoring phonetic hints (`<rPh>`). */
function richText(xml: string): string {
  const withoutPhonetics = xml.replace(/<(?:[\w.-]+:)?rPh[\s>][\s\S]*?<\/(?:[\w.-]+:)?rPh>/g, "");
  return elements(withoutPhonetics, "t")
    .map((element) => decodeXml(element.body))
    .join("");
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
  inlineStr: (body) => richText(elements(body, "is")[0]?.body ?? ""),
};

function cellValue(body: string): string {
  return decodeXml(elements(body, "v")[0]?.body ?? "");
}

function parseRow(xml: string, shared: readonly string[]): string[] {
  const values: string[] = [];
  for (const cell of elements(xml, "c")) {
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

function parseSheet(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const row of elements(xml, "row")) {
    const rowNumber = Number.parseInt(parseAttributes(row.attributes).get("r") ?? "", 10);
    const index = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : rows.length;
    if (index >= MAX_ROWS) {
      throw validationError(`A planilha aceita no máximo ${MAX_ROWS} linhas`);
    }

    while (rows.length < index) {
      rows.push([]);
    }
    rows[index] = parseRow(row.body, shared);
  }
  return rows;
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
): Promise<string | null> {
  const entry = entries.get(name);
  if (entry == null) {
    return null;
  }
  return await readEntry(bytes, entry);
}

async function readRequiredEntry(
  bytes: Uint8Array<ArrayBuffer>,
  entries: Map<string, ZipEntry>,
  name: string,
): Promise<string> {
  const content = await readOptionalEntry(bytes, entries, name);
  if (content == null) {
    throw invalidWorkbook();
  }
  return content;
}

export async function readXlsxSheets(bytes: Uint8Array<ArrayBuffer>): Promise<XlsxSheet[]> {
  if (bytes.byteLength > MAX_XLSX_BYTES) {
    throw validationError("A planilha .xlsx deve ter no máximo 20 MiB");
  }

  const entries = readDirectory(bytes);
  const [workbook, relationships, sharedXml] = await Promise.all([
    readRequiredEntry(bytes, entries, "xl/workbook.xml"),
    readRequiredEntry(bytes, entries, "xl/_rels/workbook.xml.rels"),
    readOptionalEntry(bytes, entries, "xl/sharedStrings.xml"),
  ]);
  const shared = elements(sharedXml ?? "", "si").map((item) => richText(item.body));
  const targets = new Map(
    elements(relationships, "Relationship").map((relationship) => {
      const attributes = parseAttributes(relationship.attributes);
      return [attributes.get("Id") ?? "", resolveTarget(attributes.get("Target") ?? "")];
    }),
  );
  const sheets: XlsxSheet[] = [];
  for (const sheet of elements(workbook, "sheet")) {
    const attributes = parseAttributes(sheet.attributes);
    const path = targets.get(attributes.get("id") ?? "");
    if (path == null) {
      continue;
    }

    const xml = await readRequiredEntry(bytes, entries, path);
    sheets.push({ name: attributes.get("name") ?? "", rows: parseSheet(xml, shared) });
  }
  return sheets;
}
