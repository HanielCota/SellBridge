import { describe, expect, it } from "vitest";
import { parseProductCsv } from "./product-csv.ts";
import { normalizeImportFile } from "./supplier-panel-import.ts";
import { MAX_ZIP_ENTRY_BYTES } from "./supplier-panel-import-zip.ts";
import {
  buildXlsx,
  buildZip,
  encodeWindows1252,
  TEMPLATE_HEADER,
  utf8,
  utf8WithBom,
} from "./supplier-panel-import.fixtures.ts";

const accentedRow = "PDQ-01;Pão de queijo mineiro;Açúcar e fubá;12,90;5;;;sim";

function importedProducts(bytes: Uint8Array) {
  const normalized = normalizeImportFile(bytes);
  const parsed = parseProductCsv(normalized.canonicalCsv);
  return { normalized, parsed };
}

describe("normalizeImportFile encodings", () => {
  it("reads UTF-8 without a BOM", () => {
    const { normalized, parsed } = importedProducts(utf8(`${TEMPLATE_HEADER}\n${accentedRow}\n`));
    expect(normalized.encoding).toBe("utf-8");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.title).toBe("Pão de queijo mineiro");
  });

  it("reads UTF-8 with a BOM and keeps the first column name intact", () => {
    const { normalized, parsed } = importedProducts(
      utf8WithBom(`${TEMPLATE_HEADER}\r\n${accentedRow}\r\n`),
    );
    expect(normalized.encoding).toBe("utf-8-bom");
    expect(normalized.header[0]).toBe("sku");
    expect(parsed.rows[0]?.product.description).toBe("Açúcar e fubá");
  });

  it("reads Windows-1252 (Excel's CSV) with accents instead of replacement characters", () => {
    const { normalized, parsed } = importedProducts(
      encodeWindows1252(`${TEMPLATE_HEADER}\r\n${accentedRow}\r\n`),
    );
    expect(normalized.encoding).toBe("windows-1252");
    expect(parsed.rows[0]?.product.title).toBe("Pão de queijo mineiro");
    expect(parsed.rows[0]?.product.description).toBe("Açúcar e fubá");
  });

  it("accepts accented column names typed by hand", () => {
    const { parsed } = importedProducts(
      utf8("SKU;Título;Custo;Estoque;Preço sugerido\nA-1;Café;10,00;3;19,90\n"),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product.suggestedPriceCents).toBe(1990);
  });
});

describe("normalizeImportFile delimiters", () => {
  it("reads commas, keeping a quoted comma and a semicolon inside a value", () => {
    const { normalized, parsed } = importedProducts(
      utf8('sku,titulo,descricao,custo,estoque\nC-1,"Caneca, branca","Cerâmica; 300 ml",12.90,4\n'),
    );
    expect(normalized.delimiter).toBe(",");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.product).toMatchObject({
      title: "Caneca, branca",
      description: "Cerâmica; 300 ml",
      costCents: 1290,
    });
  });

  it("reads tabs (Excel's 'Texto Unicode' and copy-paste from a sheet)", () => {
    const { normalized, parsed } = importedProducts(
      utf8("sku\ttitulo\tcusto\testoque\nT-1\tToalha; banho\t25,5\t8\n"),
    );
    expect(normalized.delimiter).toBe("\t");
    expect(parsed.rows[0]?.product).toMatchObject({ title: "Toalha; banho", costCents: 2550 });
  });

  it("reads UTF-16 tab-separated text with a BOM", () => {
    const text = "sku\ttitulo\tcusto\testoque\r\nU-1\tSabão de coco\t3,10\t9\r\n";
    const body = Buffer.from(text, "utf16le");
    const { normalized, parsed } = importedProducts(Uint8Array.from([0xff, 0xfe, ...body]));
    expect(normalized.encoding).toBe("utf-16le");
    expect(parsed.rows[0]?.product.title).toBe("Sabão de coco");
  });
});

describe("normalizeImportFile xlsx", () => {
  it("reads the first sheet with text, numbers and skipped blank cells", () => {
    const bytes = buildXlsx([
      ["sku", "titulo", "descricao", "custo", "estoque", "gtin", "ativo"],
      ["X-1", "Pão de mel", null, 12.9, 10, 7891234567895, "sim"],
      [null, null, null, null, null, null, null],
      ["X-2", "Doce de leite", "Pote 400 g", 8, 0, null, null],
    ]);
    const { normalized, parsed } = importedProducts(bytes);
    expect(normalized.format).toBe("xlsx");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((row) => row.product.sku)).toEqual(["X-1", "X-2"]);
    expect(parsed.rows[0]?.product).toMatchObject({
      title: "Pão de mel",
      costCents: 1290,
      stock: 10,
      mercadoLivreAttributes: { GTIN: "7891234567895" },
    });
    expect([...normalized.records.keys()]).toEqual([2, 4]);
  });

  it("rounds Excel's binary noise to the value the cell shows", () => {
    const bytes = buildXlsx([
      ["sku", "titulo", "custo", "estoque"],
      ["N-1", "Ruído", 12.899999999999999, 1],
    ]);
    expect(importedProducts(bytes).parsed.rows[0]?.product.costCents).toBe(1290);
  });

  it("refuses a sheet that inflates past the cap (zip bomb)", () => {
    const bomb = buildZip([
      { name: "xl/worksheets/sheet1.xml", content: " ".repeat(MAX_ZIP_ENTRY_BYTES + 1) },
    ]);
    expect(bomb.byteLength).toBeLessThan(2 * 1024 * 1024);
    expect(() => normalizeImportFile(bomb)).toThrow(/Não foi possível abrir a planilha/);
  });

  it("refuses a damaged spreadsheet with a message that says what to do", () => {
    const damaged = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(() => normalizeImportFile(damaged)).toThrow(/salve de novo como .xlsx ou CSV/);
  });
});

describe("normalizeImportFile limits and header", () => {
  it("names the missing required columns", () => {
    expect(() => normalizeImportFile(utf8("sku;titulo\nA;B\n"))).toThrow(
      "Faltam as colunas custo, estoque",
    );
  });

  it("names an unknown column with its letter", () => {
    expect(() => normalizeImportFile(utf8("sku;titulo;custo;estoque;preco\nA;B;1;1;2\n"))).toThrow(
      '"preco" em E',
    );
  });

  it("refuses a file with only the header", () => {
    expect(() => normalizeImportFile(utf8(`${TEMPLATE_HEADER}\n`))).toThrow(/só o cabeçalho/);
  });

  it("refuses more than 2 MB before reading it", () => {
    expect(() => normalizeImportFile(new Uint8Array(2 * 1024 * 1024 + 1))).toThrow(/2 MB/);
  });

  it("keeps the original line numbers across blank lines and multi-line values", () => {
    const normalized = normalizeImportFile(
      utf8(`${TEMPLATE_HEADER}\n\nM-1;"Linha 1\nLinha 2";;1;1;;;\nM-2;Ok;;abc;1;;;\n`),
    );
    const parsed = parseProductCsv(normalized.canonicalCsv);
    const line = parsed.errors[0]?.line ?? 0;
    expect(normalized.originalLines.get(line)).toBe(5);
  });
});
