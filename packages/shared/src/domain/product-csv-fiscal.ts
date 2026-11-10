import type { z } from "zod";
import {
  productFiscalSchema,
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

function parseCell(entry: FiscalColumn, value: string): FiscalResult {
  const schema: z.ZodType = productFiscalSchema.shape[entry.field];
  const parsed = schema.safeParse(entry.read(value));
  if (!parsed.success) {
    return {
      reason: `${entry.label}: "${value}" ${parsed.error.issues[0]?.message ?? "valor inválido"}`,
    };
  }
  return { fiscal: { [entry.field]: parsed.data } };
}

/** The fiscal cells of one line; blank cells are left out. Every bad cell is named. */
export function parseCsvFiscal(values: Readonly<Record<string, string>>): FiscalResult {
  const results = FISCAL_COLUMNS.flatMap((entry) => {
    const value = (values[entry.column] ?? "").trim();
    return value === "" ? [] : [parseCell(entry, value)];
  });
  const failures = results.flatMap((result) => ("reason" in result ? [result.reason] : []));
  if (failures.length > 0) {
    return { reason: failures.join("; ") };
  }
  return {
    fiscal: Object.assign(
      {},
      ...results.map((result) => ("fiscal" in result ? result.fiscal : {})),
    ),
  };
}
