import type { z } from "zod";
import {
  productFiscalPatchSchema,
  type ProductFiscal,
  type ProductFiscalPatch,
} from "./product-fiscal.ts";

/**
 * The spreadsheet columns with a product's NF-e data. All optional: a blank cell keeps what the
 * product already has, so a supplier can send only the NCM column for a catalog already loaded.
 */

interface FiscalColumn {
  readonly column: string;
  readonly field: keyof ProductFiscal;
  readonly label: string;
  readonly read: (value: string) => unknown;
}

const asText = (value: string): string => value;
const asInteger = (value: string): number | string => (/^\d+$/.test(value) ? Number(value) : value);
/** "0", or "0 – Nacional" copied from the form: the leading digit is the origin. */
const asOrigin = (value: string): number | string => {
  const match = /^(\d)(?:\D.*)?$/.exec(value);
  return match?.[1] === undefined ? value : Number(match[1]);
};
const asUnit = (value: string): string => value.toUpperCase();

const FISCAL_COLUMNS: readonly FiscalColumn[] = [
  { column: "ncm", field: "ncm", label: "NCM", read: asText },
  { column: "origem", field: "origin", label: "Origem", read: asOrigin },
  { column: "unidade", field: "unit", label: "Unidade", read: asUnit },
  { column: "cest", field: "cest", label: "CEST", read: asText },
  { column: "peso_liquido_g", field: "netWeightGrams", label: "Peso líquido", read: asInteger },
  { column: "cfop_estado", field: "cfopInState", label: "CFOP dentro do estado", read: asText },
  { column: "cfop_fora", field: "cfopOutOfState", label: "CFOP para outro estado", read: asText },
  { column: "csosn_cst", field: "icmsCode", label: "CSOSN/CST", read: asText },
  { column: "cst_pis_cofins", field: "pisCofinsCst", label: "CST PIS/COFINS", read: asText },
];

export const PRODUCT_CSV_FISCAL_COLUMNS: readonly string[] = FISCAL_COLUMNS.map(
  (entry) => entry.column,
);

type FiscalResult = { fiscal: ProductFiscalPatch } | { reason: string };

const COLUMN_OF_FIELD: ReadonlyMap<PropertyKey, FiscalColumn> = new Map(
  FISCAL_COLUMNS.map((entry) => [entry.field, entry] as const),
);

/** The fiscal cells of one line; blank cells are left out. Every bad cell is named. */
export function parseCsvFiscal(values: Readonly<Record<string, string>>): FiscalResult {
  const cells = new Map<keyof ProductFiscal, string>();
  const read: Record<string, unknown> = {};
  for (const entry of FISCAL_COLUMNS) {
    const value = (values[entry.column] ?? "").trim();
    if (value !== "") {
      cells.set(entry.field, value);
      read[entry.field] = entry.read(value);
    }
  }
  const parsed = productFiscalPatchSchema.safeParse(read);
  if (parsed.success) {
    return { fiscal: parsed.data };
  }
  return { reason: failureReasons(parsed.error.issues, cells).join("; ") };
}

/** One reason per bad cell (its first issue), in the spreadsheet's column order. */
function failureReasons(
  issues: readonly z.core.$ZodIssue[],
  cells: ReadonlyMap<keyof ProductFiscal, string>,
): string[] {
  const reasons = new Map<FiscalColumn, string>();
  for (const issue of issues) {
    const entry = COLUMN_OF_FIELD.get(issue.path[0] ?? "");
    if (entry === undefined) {
      throw new Error(`A fiscal issue points at no spreadsheet column: "${issue.path.join(".")}"`);
    }
    if (!reasons.has(entry)) {
      reasons.set(entry, `${entry.label}: "${cells.get(entry.field) ?? ""}" ${issue.message}`);
    }
  }
  return FISCAL_COLUMNS.flatMap((entry) => {
    const reason = reasons.get(entry);
    return reason === undefined ? [] : [reason];
  });
}
