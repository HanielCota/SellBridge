import type { ProductCsvError } from "./product-csv.ts";
import {
  columnGuide,
  columnGuideByLabel,
  IMPORT_COLUMNS,
  type ImportColumnGuide,
} from "./supplier-panel-import-columns.ts";
import type { ImportRecord } from "./supplier-panel-import-table.ts";

/**
 * product-csv explains a bad line in a few words ("Custo: valor inválido"). The supplier sees
 * where (line and column, with the spreadsheet letter), what was received and what was expected.
 */
export interface ImportIssue {
  readonly column: string | null;
  readonly columnLetter: string | null;
  readonly received: string | null;
  readonly expected: string | null;
  /** What is wrong, in a few words ("Valor inválido", "Categoria não encontrada"). */
  readonly problem: string;
  readonly message: string;
}

export interface ImportRowIssues {
  readonly line: number;
  readonly sku: string | null;
  readonly issues: readonly ImportIssue[];
}

const MAX_SHOWN_VALUE = 80;
/**
 * product-csv joins a row's problems with "; ". A value quoted inside a reason may hold "; " too,
 * so the reason is cut only where the next part starts with a known column label.
 */
const REASON_LABELS = [
  ...IMPORT_COLUMNS.map((entry) => entry.label),
  "Linha",
  "Atributos do Mercado Livre",
];
const REASON_SEPARATOR = new RegExp(
  // Labels are plain words ("Preço sugerido"), with nothing a regular expression would read.
  `; (?=(?:${REASON_LABELS.join("|")}):)`,
);
const DUPLICATE_SKU = "SKU duplicado no arquivo:";
const UNKNOWN_CATEGORY = "Categoria desconhecida:";
const COLUMN_COUNT = "Quantidade de colunas diferente do cabeçalho";

/** The columns after normalization, with the letter each had in the supplier's own file. */
export interface ImportTableShape {
  readonly header: readonly string[];
  readonly letters: readonly string[];
}

interface RowContext extends ImportTableShape {
  readonly record: ImportRecord | null;
}

/** The value as the supplier typed it, short enough for a table cell. */
export function shownValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "(vazio)";
  }
  if (trimmed.length <= MAX_SHOWN_VALUE) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_SHOWN_VALUE - 1)}…`;
}

function cellIssue(guide: ImportColumnGuide, context: RowContext, problem: string): ImportIssue {
  const index = context.header.indexOf(guide.column);
  const received = shownValue(context.record?.fields[index] ?? "");
  const letter = context.letters[index] ?? null;
  const place = letter === null ? `coluna ${guide.column}` : `coluna ${letter} (${guide.column})`;
  return {
    column: guide.column,
    columnLetter: letter,
    received,
    expected: guide.format,
    problem,
    message: `${problem} na ${place}: recebemos "${received}". Esperado: ${guide.format}.`,
  };
}

function rowIssue(message: string): ImportIssue {
  return {
    column: null,
    columnLetter: null,
    received: null,
    expected: null,
    problem: message,
    message,
  };
}

function columnCountIssue(context: RowContext): ImportIssue {
  const received = context.record?.fields.length ?? 0;
  return rowIssue(
    `A linha tem ${received} colunas, mas o cabeçalho tem ${context.header.length}. ` +
      "Confira se algum valor tem o separador dentro sem estar entre aspas.",
  );
}

function reasonParts(reason: string): readonly string[] {
  return reason.split(REASON_SEPARATOR);
}

function partIssue(part: string, context: RowContext): ImportIssue {
  const label = part.split(":", 1)[0] ?? "";
  const guide = columnGuideByLabel(label);
  if (guide === null) {
    return rowIssue(part);
  }
  return cellIssue(guide, context, "Valor inválido");
}

function specialIssue(reason: string, context: RowContext): ImportIssue | null {
  const sku = columnGuide("sku");
  const category = columnGuide("categoria");
  if (reason === COLUMN_COUNT) {
    return columnCountIssue(context);
  }
  if (reason.startsWith(DUPLICATE_SKU) && sku !== null) {
    return cellIssue(sku, context, "SKU repetido de uma linha anterior");
  }
  if (reason.startsWith(UNKNOWN_CATEGORY) && category !== null) {
    return cellIssue(category, context, "Categoria não encontrada");
  }
  return null;
}

/** The friendly issues behind one product-csv (or import plan) reason. */
export function describeReason(reason: string, context: RowContext): readonly ImportIssue[] {
  const special = specialIssue(reason, context);
  if (special !== null) {
    return [special];
  }
  return reasonParts(reason).map((part) => partIssue(part, context));
}

export function describeStructuralError(error: ImportRecord["structuralError"]): ImportIssue {
  if (error === "unclosed-quote") {
    return rowIssue(
      "Um valor abre aspas e não fecha. Feche as aspas ou remova-as e salve o arquivo de novo.",
    );
  }
  return rowIssue(
    'Há aspas no meio de um valor. Coloque o valor inteiro entre aspas e escreva "" para cada aspa dentro dele.',
  );
}

/** Errors of the same line together, in line order, each row with its SKU when there is one. */
export function groupIssuesByRow(
  errors: readonly ProductCsvError[],
  records: ReadonlyMap<number, ImportRecord>,
  shape: ImportTableShape,
): ImportRowIssues[] {
  const skuIndex = shape.header.indexOf("sku");
  const lines = [...new Set(errors.map((rowError) => rowError.line))].toSorted(
    (first, second) => first - second,
  );
  return lines.map((line) => {
    const record = records.get(line) ?? null;
    const context = { ...shape, record };
    const issues = errors
      .filter((rowError) => rowError.line === line)
      .flatMap((rowError) =>
        record?.structuralError
          ? [describeStructuralError(record.structuralError)]
          : describeReason(rowError.reason, context),
      );
    const sku = (record?.fields[skuIndex] ?? "").trim();
    return { line, sku: sku.length > 0 ? sku : null, issues };
  });
}
