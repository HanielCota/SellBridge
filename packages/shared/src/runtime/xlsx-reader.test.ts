import { describe, expect, it } from "vitest";
import { MAX_XLSX_BYTES, readXlsxSheets } from "./xlsx-reader.ts";

interface ZipFile {
  name: string;
  content: string;
  deflate?: boolean;
}

async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds a zip archive in memory; CRC is not checked by the reader, so it is left as zero. */
async function buildZip(files: ZipFile[]): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const locals: Uint8Array<ArrayBuffer>[] = [];
  const directory: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = encoder.encode(file.content);
    const data = file.deflate ? await deflateRaw(raw) : raw;
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, file.deflate ? 8 : 0, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, raw.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(10, file.deflate ? 8 : 0, true);
    entryView.setUint32(20, data.length, true);
    entryView.setUint32(24, raw.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    locals.push(local);
    directory.push(entry);
    offset += local.length;
  }
  const directorySize = directory.reduce((total, entry) => total + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...locals, ...directory, end]).arrayBuffer());
}

const workbook = `<?xml version="1.0"?><workbook xmlns:r="rel"><sheets>
<sheet name="Produtos" sheetId="1" r:id="rId1"/><sheet name="Outra &amp; mais" sheetId="2" r:id="rId2"/>
</sheets></workbook>`;
const relationships = `<Relationships>
<Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="ws"/>
<Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml" Type="ws"/>
<Relationship Id="rId3" Target="sharedStrings.xml" Type="ss"/></Relationships>`;
const sharedStrings = `<sst><si><t>SKU</t></si><si><r><t>Pre</t></r><r><t xml:space="preserve">ço </t></r><rPh><t>ignorar</t></rPh></si><si><t>A&amp;B &#233; &#x1F45C;</t></si></sst>`;
const firstSheet = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>
<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"/><c r="C3"><v>14.699999999999999</v></c><c r="D3" t="inlineStr"><is><t>linha 1
linha 2</t></is></c><c r="E3" t="b"><v>1</v></c></row>
</sheetData></worksheet>`;
const secondSheet = `<x:worksheet xmlns:x="ns"><x:sheetData><x:row><x:c t="str"><x:v>sem referência</x:v></x:c><x:c><x:v>2</x:v></x:c></x:row></x:sheetData></x:worksheet>`;

function workbookFiles(options: { deflate: boolean }): ZipFile[] {
  return [
    { name: "xl/workbook.xml", content: workbook, ...options },
    { name: "xl/_rels/workbook.xml.rels", content: relationships, ...options },
    { name: "xl/sharedStrings.xml", content: sharedStrings, ...options },
    { name: "xl/worksheets/sheet1.xml", content: firstSheet, ...options },
    { name: "xl/worksheets/sheet2.xml", content: secondSheet, ...options },
  ];
}

describe("readXlsxSheets", () => {
  it("deve ler texto, números, strings inline e células vazias de cada aba", async () => {
    const bytes = await buildZip(workbookFiles({ deflate: true }));

    const sheets = await readXlsxSheets(bytes);

    expect(sheets).toEqual([
      {
        name: "Produtos",
        rows: [
          ["SKU", "", "Preço "],
          [],
          ["A&B é 👜", "", "14.699999999999999", "linha 1\nlinha 2", "1"],
        ],
      },
      { name: "Outra & mais", rows: [["sem referência", "2"]] },
    ]);
  });

  it("deve ler entradas sem compressão", async () => {
    const bytes = await buildZip(workbookFiles({ deflate: false }));

    const sheets = await readXlsxSheets(bytes);

    expect(sheets.map((sheet) => sheet.name)).toEqual(["Produtos", "Outra & mais"]);
  });

  it("deve recusar arquivos que não são zip", async () => {
    const bytes = new TextEncoder().encode("sku;titulo\nA;B");

    await expect(readXlsxSheets(bytes)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("deve recusar pastas de trabalho sem workbook.xml", async () => {
    const bytes = await buildZip([{ name: "xl/outro.xml", content: "<a/>" }]);

    await expect(readXlsxSheets(bytes)).rejects.toMatchObject({
      userMessage: "Planilha .xlsx inválida ou corrompida",
    });
  });

  it("deve recusar arquivos acima do limite", async () => {
    const bytes = new Uint8Array(MAX_XLSX_BYTES + 1);

    await expect(readXlsxSheets(bytes)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
