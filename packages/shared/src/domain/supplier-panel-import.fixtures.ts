import { crc32, deflateRawSync } from "node:zlib";

/**
 * Test-only builders for the import fixtures: text files in the encodings Excel saves, and a
 * small .xlsx laid out the way Excel writes one (shared strings, numbers, skipped blank cells).
 */

export const TEMPLATE_HEADER = "sku;titulo;descricao;custo;estoque;categoria;imagens;ativo";

export function encodeWindows1252(text: string): Uint8Array {
  // Latin-1 covers every Portuguese letter, and Windows-1252 matches it on those code points.
  return Uint8Array.from(Buffer.from(text, "latin1"));
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8WithBom(text: string): Uint8Array {
  return Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8(text)]);
}

interface ZipFile {
  readonly name: string;
  readonly content: string;
}

function uint16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

export function buildZip(files: readonly ZipFile[]): Uint8Array {
  const local: number[] = [];
  const directory: number[] = [];
  for (const file of files) {
    const name = [...utf8(file.name)];
    const raw = utf8(file.content);
    const data = [...deflateRawSync(raw)];
    const checksum = crc32(raw);
    const offset = local.length;
    const sizes = [...uint32(checksum), ...uint32(data.length), ...uint32(raw.length)];
    local.push(...uint32(0x04034b50), ...uint16(20), ...uint16(0), ...uint16(8), ...uint32(0));
    local.push(...sizes, ...uint16(name.length), ...uint16(0), ...name, ...data);
    directory.push(...uint32(0x02014b50), ...uint16(20), ...uint16(20), ...uint16(0));
    directory.push(...uint16(8), ...uint32(0), ...sizes, ...uint16(name.length), ...uint16(0));
    directory.push(...uint16(0), ...uint16(0), ...uint16(0), ...uint32(0), ...uint32(offset));
    directory.push(...name);
  }
  const end = [
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(directory.length),
    ...uint32(local.length),
    ...uint16(0),
  ];
  return Uint8Array.from([...local, ...directory, ...end]);
}

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function letter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Text cells go to the shared strings table (as Excel does); numbers stay numeric cells. */
export function buildXlsx(rows: readonly (readonly (string | number | null)[])[]): Uint8Array {
  const shared: string[] = [];
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.flatMap((value, columnIndex) => {
      const reference = `${letter(columnIndex)}${rowIndex + 1}`;
      if (value === null) {
        return [];
      }
      if (typeof value === "number") {
        return [`<c r="${reference}"><v>${value}</v></c>`];
      }
      shared.push(value);
      return [`<c r="${reference}" t="s"><v>${shared.length - 1}</v></c>`];
    });
    return `<row r="${rowIndex + 1}">${cells.join("")}</row>`;
  });
  const main = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const relations = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  return buildZip([
    { name: "[Content_Types].xml", content: "<Types/>" },
    {
      name: "xl/workbook.xml",
      content: `<workbook ${main} ${relations}><sheets><sheet name="Produtos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content:
        '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      name: "xl/sharedStrings.xml",
      content: `<sst ${main}>${shared.map((text) => `<si><t xml:space="preserve">${escapeXml(text)}</t></si>`).join("")}</sst>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<worksheet ${main}><sheetData>${sheetRows.join("")}</sheetData></worksheet>`,
    },
  ]);
}
