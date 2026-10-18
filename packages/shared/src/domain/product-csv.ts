import { z } from "zod";
import { validationError } from "../runtime/errors.ts";
import {
  adminProductValuesSchema,
  knownCostCentsSchema,
  MAX_PRODUCT_CSV_BYTES,
  MAX_PRODUCT_CSV_ROWS,
} from "../schemas/admin-suppliers.ts";
import { freeText } from "../schemas/common.ts";
import { LISTING_MAX_PRICE_CENTS } from "../schemas/stores.ts";
import { PRODUCT_CSV_ATTRIBUTE_COLUMNS, parseCsvAttributes } from "./product-csv-attributes.ts";

export const PRODUCT_CSV_TEMPLATE =
  "\uFEFFsku;titulo;descricao;custo;estoque;categoria;imagens;ativo;preco_sugerido;marca;modelo;gtin;peso_g;altura_cm;largura_cm;comprimento_cm\r\nEXEMPLO-001;Produto de exemplo;Descrição do produto;12,90;10;;https://example.com/produto.jpg;sim;19,90;Marca Exemplo;MOD-01;7891234567895;350;10;15;20\r\n";
const requiredColumns = ["sku", "titulo", "custo", "estoque"];
const allowedColumns = [
  ...requiredColumns,
  "descricao",
  "categoria",
  "imagens",
  "ativo",
  "preco_sugerido",
  ...PRODUCT_CSV_ATTRIBUTE_COLUMNS,
];
export interface ProductCsvError {
  line: number;
  reason: string;
}
interface CsvRecord {
  line: number;
  fields: string[];
  error: string | null;
}
interface CsvCursor {
  fields: string[];
  field: string;
  quoted: boolean;
  closed: boolean;
  line: number;
  startLine: number;
  error: string | null;
  records: CsvRecord[];
}
export interface ProductCsvRow {
  line: number;
  product: Omit<z.infer<typeof adminProductValuesSchema>, "categoryId" | "suggestedPriceCents"> & {
    categorySlug: string | null;
    suggestedPriceCents?: number | undefined;
    active?: boolean | undefined;
  };
}
export interface ParsedProductCsv {
  rows: ProductCsvRow[];
  errors: ProductCsvError[];
}

/** Decimal separator is unambiguous; grouping separators and rounding are rejected. */
export function parseCsvMoney(input: string): number | null {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(input.trim())) {
    return null;
  }
  const [integer = "0", fraction = ""] = input.trim().split(/[,.]/);
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > LISTING_MAX_PRICE_CENTS) {
    return null;
  }
  return cents;
}

function finishRecord(cursor: CsvCursor): CsvCursor {
  const fields = [...cursor.fields, cursor.field.trim()];
  const record = { line: cursor.startLine, fields, error: cursor.error };
  const records =
    fields.some((field) => field.length > 0) || cursor.error
      ? [...cursor.records, record]
      : cursor.records;
  if (records.length > MAX_PRODUCT_CSV_ROWS + 1) {
    throw validationError(`O CSV aceita no máximo ${MAX_PRODUCT_CSV_ROWS} linhas de produtos`);
  }
  return {
    ...cursor,
    records,
    fields: [],
    field: "",
    closed: false,
    error: null,
    startLine: cursor.line + 1,
  };
}

/**
 * Far above the template's columns. Without a ceiling, one 2 MiB line of delimiters becomes
 * millions of fields, each copying the ones before it, and the import blocks the server.
 */
const MAX_CSV_COLUMNS = 50;

function readUnquoted(cursor: CsvCursor, character: string, delimiter: string): CsvCursor {
  if (character === delimiter && cursor.fields.length >= MAX_CSV_COLUMNS) {
    throw validationError(`Cada linha do CSV aceita no máximo ${MAX_CSV_COLUMNS} colunas`);
  }
  if (character === delimiter) {
    return { ...cursor, fields: [...cursor.fields, cursor.field.trim()], field: "", closed: false };
  }
  if (character === "\n") {
    return { ...finishRecord(cursor), line: cursor.line + 1 };
  }
  if (character === '"' && cursor.field.length === 0 && !cursor.closed) {
    return { ...cursor, quoted: true };
  }
  const error = character === '"' || cursor.closed ? "Aspas inválidas no CSV" : cursor.error;
  return { ...cursor, error, field: cursor.field + character };
}

function tokenize(content: string, delimiter: string): CsvRecord[] {
  let cursor: CsvCursor = {
    fields: [],
    field: "",
    quoted: false,
    closed: false,
    line: 1,
    startLine: 1,
    error: null,
    records: [],
  };
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (!cursor.quoted) {
      cursor = readUnquoted(cursor, character, delimiter);
      continue;
    }
    if (character === '"' && content[index + 1] === '"') {
      cursor = { ...cursor, field: cursor.field + '"' };
      index += 1;
      continue;
    }
    if (character === '"') {
      cursor = { ...cursor, quoted: false, closed: true };
      continue;
    }
    cursor = {
      ...cursor,
      field: cursor.field + character,
      line: cursor.line + (character === "\n" ? 1 : 0),
    };
  }
  if (cursor.quoted) {
    cursor = { ...cursor, error: "Campo com aspas não foi fechado" };
  }
  return finishRecord(cursor).records;
}

function parseActive(value: string): boolean | null | undefined {
  if (value === "") {
    return undefined;
  }
  if (["sim", "true", "1"].includes(value.toLowerCase())) {
    return true;
  }
  if (["não", "nao", "false", "0"].includes(value.toLowerCase())) {
    return false;
  }
  return null;
}

const csvRowSchema = adminProductValuesSchema
  .omit({ categoryId: true, suggestedPriceCents: true })
  .extend({
    costCents: knownCostCentsSchema,
    categorySlug: freeText().trim().max(100).nullable(),
    suggestedPriceCents: adminProductValuesSchema.shape.suggestedPriceCents.optional(),
    active: z.boolean().optional(),
  });
const fieldLabels: Record<string, string> = {
  sku: "SKU",
  title: "Título",
  description: "Descrição",
  costCents: "Custo",
  suggestedPriceCents: "Preço sugerido",
  stock: "Estoque",
  imageUrls: "Imagens",
  active: "Ativo",
  categorySlug: "Categoria",
  mercadoLivreAttributes: "Atributos do Mercado Livre",
};

function rowCandidate(
  values: Readonly<Record<string, string>>,
  sku: string,
  mercadoLivreAttributes: Record<string, string>,
) {
  const stock = values.estoque ?? "";
  const suggestedPrice = values.preco_sugerido ?? "";
  return {
    sku,
    title: values.titulo,
    description: values.descricao ?? "",
    costCents: parseCsvMoney(values.custo ?? ""),
    stock: /^\d+$/.test(stock) ? Number(stock) : null,
    categorySlug: values.categoria || null,
    imageUrls: (values.imagens ?? "")
      .split("|")
      .map((url) => url.trim())
      .filter(Boolean),
    active: parseActive(values.ativo ?? ""),
    suggestedPriceCents: suggestedPrice ? parseCsvMoney(suggestedPrice) : undefined,
    mercadoLivreAttributes,
  };
}

function validateRecord(
  record: CsvRecord,
  headers: string[],
  seen: Set<string>,
): ProductCsvRow | ProductCsvError {
  if (record.error) {
    return { line: record.line, reason: record.error };
  }
  if (record.fields.length !== headers.length) {
    return { line: record.line, reason: "Quantidade de colunas diferente do cabeçalho" };
  }
  const values = Object.fromEntries(
    headers.map((header, index) => [header, record.fields[index] ?? ""]),
  );
  // Same form the schema stores (trimmed, NFC), so "CAFÉ-01" twice in two encodings is caught.
  const sku = (values.sku ?? "").trim().normalize("NFC");
  if (seen.has(sku)) {
    return { line: record.line, reason: `SKU duplicado no arquivo: ${sku}` };
  }
  seen.add(sku);
  const attributes = parseCsvAttributes(values);
  const parsed = csvRowSchema.safeParse(
    rowCandidate(values, sku, "attributes" in attributes ? attributes.attributes : {}),
  );
  // Every bad cell at once (schema fields, then Mercado Livre attributes), so one round of
  // fixes clears the line instead of a new error showing up after each one.
  const reasons = [
    ...(parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) => `${fieldLabels[String(issue.path[0])] ?? "Linha"}: valor inválido`,
        )),
    ...("reason" in attributes ? [attributes.reason] : []),
  ];
  if (!parsed.success || reasons.length > 0) {
    return { line: record.line, reason: reasons.join("; ") };
  }
  return { line: record.line, product: parsed.data };
}

export function parseProductCsv(input: string): ParsedProductCsv {
  if (new TextEncoder().encode(input).byteLength > MAX_PRODUCT_CSV_BYTES) {
    throw validationError("O arquivo CSV deve ter no máximo 2 MiB");
  }
  const content = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = content.split("\n", 1)[0] ?? "";
  const records = tokenize(content, firstLine.includes(";") ? ";" : ",");
  const [header, ...recordsToValidate] = records;
  if (!header || header.error) {
    throw validationError("Cabeçalho CSV inválido");
  }
  const headers = header.fields.map((field) => field.toLowerCase());
  if (
    new Set(headers).size !== headers.length ||
    requiredColumns.some((column) => !headers.includes(column)) ||
    headers.some((column) => !allowedColumns.includes(column))
  ) {
    throw validationError("Cabeçalho inválido. Use o modelo CSV disponibilizado");
  }
  if (recordsToValidate.length === 0) {
    throw validationError("O CSV não contém produtos");
  }
  const result: ParsedProductCsv = { rows: [], errors: [] };
  const seen = new Set<string>();
  for (const record of recordsToValidate) {
    const validated = validateRecord(record, headers, seen);
    if ("reason" in validated) {
      result.errors.push(validated);
      continue;
    }
    result.rows.push(validated);
  }
  return result;
}
