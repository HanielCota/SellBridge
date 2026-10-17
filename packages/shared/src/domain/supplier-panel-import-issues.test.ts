import { describe, expect, it } from "vitest";
import { parseProductCsv } from "./product-csv.ts";
import { normalizeImportFile, type NormalizedImport } from "./supplier-panel-import.ts";
import { buildFailedRowsCsv, buildValidRowsCsv } from "./supplier-panel-import-files.ts";
import { groupIssuesByRow } from "./supplier-panel-import-issues.ts";
import { encodeWindows1252, TEMPLATE_HEADER, utf8 } from "./supplier-panel-import.fixtures.ts";

const partialFile = [
  TEMPLATE_HEADER,
  "OK-1;Produto bom;;10,00;1;;;sim",
  "BAD-1;Custo errado;;R$ 12,90;1;;;sim",
  "BAD-2;Estoque e ativo;;5,00;dez;;;talvez",
  "OK-2;Outro bom;;7,50;2;;;",
  "OK-1;Repetido;;7,50;2;;;",
  'BAD-3;"Aspas abertas;;1,00;1;;;',
].join("\r\n");

/** The supplier's view of a file: friendly issues mapped back to the original lines. */
function review(normalized: NormalizedImport) {
  const parsed = parseProductCsv(normalized.canonicalCsv);
  const errors = parsed.errors.map((error) => ({
    ...error,
    line: normalized.originalLines.get(error.line) ?? error.line,
  }));
  const structural = [...normalized.records.values()]
    .filter((record) => record.structuralError !== null)
    .map((record) => ({ line: record.line, reason: "structural" }));
  return groupIssuesByRow([...errors, ...structural], normalized.records, normalized);
}

describe("groupIssuesByRow", () => {
  const normalized = normalizeImportFile(encodeWindows1252(partialFile));
  const rows = review(normalized);

  it("lists only the failed rows, in file order, with their SKU", () => {
    expect(rows.map((row) => [row.line, row.sku])).toEqual([
      [3, "BAD-1"],
      [4, "BAD-2"],
      [6, "OK-1"],
      [7, "BAD-3"],
    ]);
  });

  it("names column, letter, received value and expected format", () => {
    expect(rows[0]?.issues).toEqual([
      expect.objectContaining({
        column: "custo",
        columnLetter: "D",
        received: "R$ 12,90",
        expected: expect.stringContaining("sem R$"),
        message: expect.stringContaining('coluna D (custo): recebemos "R$ 12,90"'),
      }),
    ]);
  });

  it("splits one reason with several bad cells into one issue per column", () => {
    expect(rows[1]?.issues.map((issue) => [issue.column, issue.received])).toEqual([
      ["estoque", "dez"],
      ["ativo", "talvez"],
    ]);
  });

  it("explains a repeated SKU and broken quotes in plain words", () => {
    expect(rows[2]?.issues[0]?.message).toContain("SKU repetido");
    expect(rows[3]?.issues[0]?.message).toContain("abre aspas e não fecha");
  });

  it("maps the unknown category reason of the import plan to the category column", () => {
    const issues = groupIssuesByRow(
      [{ line: 2, reason: "Categoria desconhecida: brinquedos" }],
      new Map([
        [2, { line: 2, fields: ["A", "B", "1", "1", "brinquedos"], structuralError: null }],
      ]),
      {
        header: ["sku", "titulo", "custo", "estoque", "categoria"],
        letters: ["A", "B", "C", "D", "E"],
      },
    );
    expect(issues[0]?.issues[0]).toMatchObject({ column: "categoria", received: "brinquedos" });
  });
});

describe("failed rows export", () => {
  const normalized = normalizeImportFile(utf8(partialFile));
  const rows = review(normalized);
  const exported = buildFailedRowsCsv(normalized, normalized.records, rows);

  it("holds only the failed rows with an erro column first", () => {
    const lines = exported
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    expect(lines[0]).toBe(`erro;${TEMPLATE_HEADER}`);
    expect(lines).toHaveLength(1 + rows.length);
    expect(lines[1]).toMatch(/^"?Valor inválido na coluna D \(custo\)/);
  });

  it("imports again once fixed, ignoring the erro column", () => {
    const fixed = exported
      .replace(";R$ 12,90;", ";12,90;")
      .replace(";dez;", ";10;")
      .replace(";talvez", ";sim");
    const again = normalizeImportFile(utf8(fixed));
    const parsed = parseProductCsv(again.canonicalCsv);
    expect(again.header).not.toContain("erro");
    expect(parsed.rows.map((row) => row.product.sku)).toEqual(["BAD-1", "BAD-2", "OK-1"]);
  });
});

describe("buildValidRowsCsv", () => {
  it("keeps only the rows without errors, ready for product-csv", () => {
    const normalized = normalizeImportFile(utf8(partialFile));
    const failed = new Set(review(normalized).map((row) => row.line));
    const valid = buildValidRowsCsv(normalized, normalized.records, failed);
    const parsed = parseProductCsv(valid.content);
    expect(valid.rowCount).toBe(2);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((row) => row.product.sku)).toEqual(["OK-1", "OK-2"]);
  });
});
