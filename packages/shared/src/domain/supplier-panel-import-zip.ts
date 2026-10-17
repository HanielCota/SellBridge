import { inflateRawSync } from "node:zlib";
import { validationError } from "../runtime/errors.ts";

/**
 * Just enough of the ZIP format to open an .xlsx (Office Open XML is a ZIP of XML files):
 * stored and deflated entries, no ZIP64, no encryption. Written here instead of adding a
 * spreadsheet library: the import needs one sheet's cells, and every size is capped so a
 * crafted file ("zip bomb") is refused instead of filling the server's memory.
 */

const END_OF_DIRECTORY_SIGNATURE = 0x06054b50;
const DIRECTORY_ENTRY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const END_OF_DIRECTORY_SIZE = 22;
const MAX_COMMENT_BYTES = 0xffff;
const MAX_ENTRIES = 2000;
/** A 1,000-row sheet is a few MB of XML; far above that is a bomb, not a catalog. */
export const MAX_ZIP_ENTRY_BYTES = 32 * 1024 * 1024;
const STORED = 0;
const DEFLATED = 8;
const ENCRYPTED_FLAG = 0x1;

export interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly flags: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

function invalidSpreadsheet(): Error {
  return validationError("Não foi possível abrir a planilha; salve de novo como .xlsx ou CSV");
}

function findEndOfDirectory(view: DataView): number {
  const lowest = Math.max(0, view.byteLength - END_OF_DIRECTORY_SIZE - MAX_COMMENT_BYTES);
  for (let offset = view.byteLength - END_OF_DIRECTORY_SIZE; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw invalidSpreadsheet();
}

function readEntry(bytes: Uint8Array, view: DataView, offset: number): ZipEntry {
  if (view.getUint32(offset, true) !== DIRECTORY_ENTRY_SIGNATURE) {
    throw invalidSpreadsheet();
  }
  const nameLength = view.getUint16(offset + 28, true);
  const nameStart = offset + 46;
  return {
    name: new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength)),
    flags: view.getUint16(offset + 8, true),
    method: view.getUint16(offset + 10, true),
    compressedSize: view.getUint32(offset + 20, true),
    uncompressedSize: view.getUint32(offset + 24, true),
    localHeaderOffset: view.getUint32(offset + 42, true),
  };
}

function entryLength(view: DataView, offset: number): number {
  return (
    46 +
    view.getUint16(offset + 28, true) +
    view.getUint16(offset + 30, true) +
    view.getUint16(offset + 32, true)
  );
}

/** The entries listed in the central directory, by name. */
export function listZipEntries(bytes: Uint8Array): ReadonlyMap<string, ZipEntry> {
  if (bytes.byteLength < END_OF_DIRECTORY_SIZE) {
    throw invalidSpreadsheet();
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfDirectory(view);
  const count = view.getUint16(end + 10, true);
  if (count > MAX_ENTRIES) {
    throw invalidSpreadsheet();
  }
  const entries = new Map<string, ZipEntry>();
  let offset = view.getUint32(end + 16, true);
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.byteLength) {
      throw invalidSpreadsheet();
    }
    const entry = readEntry(bytes, view, offset);
    entries.set(entry.name, entry);
    offset += entryLength(view, offset);
  }
  return entries;
}

function entryData(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;
  if (header + 30 > bytes.byteLength || view.getUint32(header, true) !== LOCAL_HEADER_SIGNATURE) {
    throw invalidSpreadsheet();
  }
  const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.byteLength) {
    throw invalidSpreadsheet();
  }
  return bytes.subarray(start, end);
}

function inflate(data: Uint8Array): Uint8Array {
  try {
    return inflateRawSync(data, { maxOutputLength: MAX_ZIP_ENTRY_BYTES });
  } catch {
    // Corrupt data or more than the cap once inflated: either way the file is refused.
    throw invalidSpreadsheet();
  }
}

/** The text of one entry, or null when the archive has no such file. */
export function readZipText(
  bytes: Uint8Array,
  entries: ReadonlyMap<string, ZipEntry>,
  name: string,
): string | null {
  const entry = entries.get(name);
  if (entry === undefined) {
    return null;
  }
  if ((entry.flags & ENCRYPTED_FLAG) !== 0) {
    throw validationError("A planilha tem senha; remova a senha e envie de novo");
  }
  if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
    throw invalidSpreadsheet();
  }
  const data = entryData(bytes, entry);
  if (entry.method === STORED) {
    return new TextDecoder().decode(data);
  }
  if (entry.method === DEFLATED) {
    return new TextDecoder().decode(inflate(data));
  }
  throw invalidSpreadsheet();
}

/** "PK\x03\x04": every .xlsx starts like this; a CSV never does. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
