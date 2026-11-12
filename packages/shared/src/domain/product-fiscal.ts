import { z } from "zod";

/**
 * The fiscal data a supplier's ERP needs to issue the NF-e for a product (report of 06/11/2026).
 * NCM, origin and unit belong to the product; the tax codes (CFOP, CSOSN or CST, PIS/COFINS)
 * usually come from the supplier's defaults and are stored on the product only to override them.
 */

/** What the ERP accepts as "no barcode" in the GTIN fields. */
export const NO_GTIN = "SEM GTIN";

/** Commercial units the panel offers; "PAR" for shoes, "KIT" for sets. */
export const PRODUCT_UNITS = ["UN", "PAR", "KIT", "CX", "PC", "CJ", "MT", "KG", "LT"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_UNIT_LABELS: Readonly<Record<ProductUnit, string>> = {
  UN: "UN – unidade",
  PAR: "PAR – par",
  KIT: "KIT – kit",
  CX: "CX – caixa",
  PC: "PC – peça",
  CJ: "CJ – conjunto",
  MT: "MT – metro",
  KG: "KG – quilo",
  LT: "LT – litro",
};

/** SEFAZ origin table (0 to 8), in the words a supplier recognises. */
export const PRODUCT_ORIGIN_LABELS: readonly string[] = [
  "0 – Nacional (fabricado no Brasil)",
  "1 – Estrangeira, importação direta",
  "2 – Estrangeira, comprada no Brasil",
  "3 – Nacional, mais de 40% importado",
  "4 – Nacional, processo produtivo básico",
  "5 – Nacional, até 40% importado",
  "6 – Estrangeira direta, sem similar nacional",
  "7 – Estrangeira comprada no Brasil, sem similar nacional",
  "8 – Nacional, mais de 70% importado",
];
const MAX_ORIGIN = 8;

export const TAX_REGIMES = ["simples", "presumido", "real"] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number];
export const TAX_REGIME_LABELS: Readonly<Record<TaxRegime, string>> = {
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
};

/** CSOSN codes (Simples Nacional) and CST ICMS codes (other regimes) a sale NF-e may carry. */
const CSOSN_CODES = new Set(["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"]);
const CST_ICMS_CODES = new Set(["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"]);

const NCM_LENGTH = 8;
const CEST_LENGTH = 7;
const MAX_NET_WEIGHT_GRAMS = 100_000;
/** "0000.00.00" is what some ERPs fill in when nobody knew the code; SEFAZ refuses it. */
const PLACEHOLDER_NCM = "0".repeat(NCM_LENGTH);
const GRAMS_FORMAT = new Intl.NumberFormat("pt-BR");

function onlyDigits(length: number): RegExp {
  return new RegExp(`^\\d{${length}}$`);
}

function digitsOf(value: string): string {
  return value.replace(/[.\s-]/g, "");
}

/** "6402.99.90" → "64029990": the dots are the screen mask, the ERP wants digits only. */
export const ncmSchema = z
  .string()
  .trim()
  .transform(digitsOf)
  .pipe(
    z
      .string()
      .regex(onlyDigits(NCM_LENGTH), `O NCM tem ${NCM_LENGTH} números, como 6402.99.90`)
      .refine(
        (ncm) => ncm !== PLACEHOLDER_NCM,
        "O NCM não pode ser 0000.00.00. Confira na nota de compra do produto.",
      ),
  );

export const cestSchema = z
  .string()
  .trim()
  .transform(digitsOf)
  .pipe(
    z.string().regex(onlyDigits(CEST_LENGTH), `O CEST tem ${CEST_LENGTH} números, como 28.063.00`),
  );

export const productOriginSchema = z
  .number("Escolha a origem")
  .int("Escolha a origem")
  .min(0, "Escolha a origem")
  .max(MAX_ORIGIN, "Escolha a origem");

export const productUnitSchema = z.enum(PRODUCT_UNITS, "Escolha a unidade");

/** A sale CFOP: 5xxx inside the supplier's state, 6xxx to another state. */
export const cfopInStateSchema = z
  .string()
  .trim()
  .regex(/^5\d{3}$/, "Use um CFOP de venda dentro do estado, como 5102");
export const cfopOutOfStateSchema = z
  .string()
  .trim()
  .regex(/^6\d{3}$/, "Use um CFOP de venda para outro estado, como 6102");

/** CSOSN (3 digits) for Simples Nacional, CST ICMS (2 digits) otherwise. */
export const icmsCodeSchema = z
  .string()
  .trim()
  .refine(
    (code) => CSOSN_CODES.has(code) || CST_ICMS_CODES.has(code),
    "Use um CSOSN (como 102) ou um CST de ICMS (como 00)",
  );

export const pisCofinsCstSchema = z
  .string()
  .trim()
  .regex(/^(0[1-9]|[1-9]\d)$/, "Use o CST de PIS/COFINS com 2 números, como 49");

/** Whether `code` fits the regime: CSOSN for Simples Nacional, CST ICMS for the others. */
export function icmsCodeFitsRegime(code: string, regime: TaxRegime): boolean {
  return regime === "simples" ? CSOSN_CODES.has(code) : CST_ICMS_CODES.has(code);
}

/**
 * Why a product's own ICMS code cannot go with the supplier's regime, or null when it can (or
 * when there is no code or no regime yet to compare it with).
 */
export function icmsOverrideProblem(
  icmsCode: string | null | undefined,
  regime: TaxRegime | null,
): string | null {
  if (icmsCode === null || icmsCode === undefined || regime === null) {
    return null;
  }
  if (icmsCodeFitsRegime(icmsCode, regime)) {
    return null;
  }
  return `${icmsCodeLabel(regime)}: "${icmsCode}" não vale para ${TAX_REGIME_LABELS[regime]}. Deixe em branco para usar o padrão da marca.`;
}

/** "CSOSN" for Simples Nacional, "CST ICMS" for the other regimes, as the form names the field. */
export function icmsCodeLabel(regime: TaxRegime): string {
  return regime === "simples" ? "CSOSN (Simples Nacional)" : icmsCodeShortLabel(regime);
}

/** "CSOSN" or "CST ICMS": the field's name where the regime is already on screen. */
export function icmsCodeShortLabel(regime: TaxRegime): string {
  return regime === "simples" ? "CSOSN" : "CST ICMS";
}

/** A product's fiscal data; every field may still be empty while the supplier fills it in. */
export const productFiscalSchema = z.object({
  ncm: ncmSchema.nullable(),
  origin: productOriginSchema.nullable(),
  unit: productUnitSchema.nullable(),
  cest: cestSchema.nullable(),
  netWeightGrams: z
    .number("Informe o peso em gramas")
    .int("Use gramas inteiras")
    .min(1, "O peso é de pelo menos 1 g")
    .max(
      MAX_NET_WEIGHT_GRAMS,
      `O peso é de até ${GRAMS_FORMAT.format(MAX_NET_WEIGHT_GRAMS)} g (${MAX_NET_WEIGHT_GRAMS / 1000} kg)`,
    )
    .nullable(),
  /** Null: the supplier's default applies. */
  cfopInState: cfopInStateSchema.nullable(),
  cfopOutOfState: cfopOutOfStateSchema.nullable(),
  icmsCode: icmsCodeSchema.nullable(),
  pisCofinsCst: pisCofinsCstSchema.nullable(),
});
export type ProductFiscal = z.infer<typeof productFiscalSchema>;

/** Some of the fields: what a spreadsheet line or the stored column may carry. */
export const productFiscalPatchSchema = productFiscalSchema.partial();
export type ProductFiscalPatch = z.infer<typeof productFiscalPatchSchema>;

export const EMPTY_PRODUCT_FISCAL: ProductFiscal = {
  ncm: null,
  origin: null,
  unit: null,
  cest: null,
  netWeightGrams: null,
  cfopInState: null,
  cfopOutOfState: null,
  icmsCode: null,
  pisCofinsCst: null,
};

/**
 * Reads what is stored in the product's `fiscal` column. Rows written before a field existed, or
 * a value that no longer passes the rules, read as empty rather than breaking the screen.
 */
export function readProductFiscal(stored: unknown): ProductFiscal {
  if (typeof stored !== "object" || stored === null) {
    return EMPTY_PRODUCT_FISCAL;
  }
  const shape = productFiscalSchema.shape;
  return {
    ncm: readStoredField(stored, "ncm", shape.ncm),
    origin: readStoredField(stored, "origin", shape.origin),
    unit: readStoredField(stored, "unit", shape.unit),
    cest: readStoredField(stored, "cest", shape.cest),
    netWeightGrams: readStoredField(stored, "netWeightGrams", shape.netWeightGrams),
    cfopInState: readStoredField(stored, "cfopInState", shape.cfopInState),
    cfopOutOfState: readStoredField(stored, "cfopOutOfState", shape.cfopOutOfState),
    icmsCode: readStoredField(stored, "icmsCode", shape.icmsCode),
    pisCofinsCst: readStoredField(stored, "pisCofinsCst", shape.pisCofinsCst),
  };
}

/** One stored field, or null when it is missing or no longer passes its rule. */
function readStoredField<Value>(
  stored: object,
  key: keyof ProductFiscal,
  schema: z.ZodType<Value>,
): Value | null {
  const parsed = schema.safeParse(Reflect.get(stored, key));
  return parsed.success ? parsed.data : null;
}

/** NCM, origin and unit: what an NF-e cannot leave out (the rest has supplier defaults). */
export function hasRequiredFiscalData(fiscal: ProductFiscal): boolean {
  return fiscal.ncm !== null && fiscal.origin !== null && fiscal.unit !== null;
}

/** The origin and unit the supplier saved in Marca: the NF-e uses them when a product has none. */
export interface FiscalFallback {
  readonly origin: NonNullable<ProductFiscal["origin"]>;
  readonly unit: NonNullable<ProductFiscal["unit"]>;
}

/**
 * The product's NF-e data as the note will read it: its own origin and unit, else the supplier's.
 * Only for checking what is missing; what is stored stays the product's own.
 */
export function withFiscalFallback(
  fiscal: ProductFiscal,
  fallback: FiscalFallback | null,
): ProductFiscal {
  if (fallback === null) {
    return fiscal;
  }
  return {
    ...fiscal,
    origin: fiscal.origin ?? fallback.origin,
    unit: fiscal.unit ?? fallback.unit,
  };
}

/** "64029990" → "6402.99.90", the mask the form shows. */
export function formatNcm(ncm: string): string {
  const digits = digitsOf(ncm);
  if (digits.length !== NCM_LENGTH) {
    return ncm;
  }
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

/** A GTIN field value the ERP accepts: digits (checked elsewhere) or the literal "SEM GTIN". */
export function isNoGtin(value: string): boolean {
  return value.trim().toUpperCase() === NO_GTIN;
}

/** Masks an NCM while it is typed: "61091" → "6109.1", up to "6109.10.00". */
export function maskNcmInput(input: string): string {
  return input
    .replace(/\D/g, "")
    .slice(0, NCM_LENGTH)
    .replace(/^(\d{4})(\d)/, "$1.$2")
    .replace(/^(\d{4})\.(\d{2})(\d)/, "$1.$2.$3");
}
