/**
 * Turns the bytes of an uploaded spreadsheet text file into a string. Excel on Windows saves
 * "CSV (separado por vírgulas)" in Windows-1252, so a strict UTF-8 read would turn every
 * "Açúcar" into "A��car"; "Texto Unicode" saves UTF-16 with a BOM.
 */

export type ImportTextEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "windows-1252";

export interface DecodedImportText {
  readonly text: string;
  readonly encoding: ImportTextEncoding;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UTF16_LE_BOM = [0xff, 0xfe] as const;
const UTF16_BE_BOM = [0xfe, 0xff] as const;

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((byte, index) => bytes[index] === byte);
}

function decodeWith(label: string, bytes: Uint8Array, fatal = false): string {
  return new TextDecoder(label, { fatal, ignoreBOM: false }).decode(bytes);
}

/** Strict UTF-8, or null when the bytes are not valid UTF-8 (then they are a legacy code page). */
function tryUtf8(bytes: Uint8Array): string | null {
  try {
    return decodeWith("utf-8", bytes, true);
  } catch {
    return null;
  }
}

/** The BOM decides when there is one; otherwise valid UTF-8 wins and anything else is Windows-1252. */
export function decodeImportText(bytes: Uint8Array): DecodedImportText {
  if (startsWithBytes(bytes, UTF8_BOM)) {
    return { text: decodeWith("utf-8", bytes), encoding: "utf-8-bom" };
  }
  if (startsWithBytes(bytes, UTF16_LE_BOM)) {
    return { text: decodeWith("utf-16le", bytes), encoding: "utf-16le" };
  }
  if (startsWithBytes(bytes, UTF16_BE_BOM)) {
    return { text: decodeWith("utf-16be", bytes), encoding: "utf-16be" };
  }
  const utf8 = tryUtf8(bytes);
  if (utf8 !== null) {
    return { text: utf8, encoding: "utf-8" };
  }
  return { text: decodeWith("windows-1252", bytes), encoding: "windows-1252" };
}

export const IMPORT_ENCODING_LABELS: Readonly<Record<ImportTextEncoding, string>> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8",
  "utf-16le": "UTF-16",
  "utf-16be": "UTF-16",
  "windows-1252": "Windows-1252",
};
