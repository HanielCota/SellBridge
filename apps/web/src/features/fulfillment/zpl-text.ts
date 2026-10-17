/**
 * Readable text of a ZPL label (the thermal-printer format marketplaces also offer): one line per
 * printed text field, in the order the label prints them. Barcodes and QR codes are left out.
 */
const FIELD_END = "^FS";
const FIELD_DATA = "^FD";
const HEX_ESCAPE_COMMAND = /\^FH([^^])?/;
const BARCODE_COMMAND = /\^B[0-9A-Z]/;
/** `\&` breaks a line inside a ^FB text block. */
const BLOCK_LINE_BREAK = /\\&/g;
const DEFAULT_HEX_INDICATOR = "_";

export function isZpl(text: string): boolean {
  return text.includes("^XA") && text.includes(FIELD_DATA);
}

export function zplToText(zpl: string): string {
  return zpl
    .split(FIELD_END)
    .map(fieldText)
    .filter((line) => line.length > 0)
    .join("\n");
}

function fieldText(segment: string): string {
  const start = segment.lastIndexOf(FIELD_DATA);
  if (start === -1) return "";
  const command = segment.slice(0, start);
  if (BARCODE_COMMAND.test(command)) return "";
  const raw = segment.slice(start + FIELD_DATA.length);
  const escape = HEX_ESCAPE_COMMAND.exec(command);
  const decoded = escape === null ? raw : decodeHex(raw, escape[1] ?? DEFAULT_HEX_INDICATOR);
  return decoded.replace(BLOCK_LINE_BREAK, "\n").trim();
}

/** ^FH writes bytes as `_C3_A1` (UTF-8 "á"): every run of escapes is decoded together. */
function decodeHex(text: string, indicator: string): string {
  const escaped = indicator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const run = new RegExp(`(?:${escaped}[0-9A-Fa-f]{2})+`, "g");
  return text.replace(run, (match) => {
    const bytes = match
      .split(indicator)
      .filter((pair) => pair.length > 0)
      .map((pair) => Number.parseInt(pair, 16));
    return new TextDecoder().decode(new Uint8Array(bytes));
  });
}
