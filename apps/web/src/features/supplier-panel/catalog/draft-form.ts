import { formatCentsForInput } from "@sellbridge/shared/money";
import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import { keepsNegativeShelfOnly, NEGATIVE_STOCK_MESSAGE } from "@sellbridge/shared/schemas";
import {
  catalogDraftValuesSchema,
  type CatalogDraftValues,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import {
  MIN_DESCRIPTION_LENGTH,
  type CompletenessProduct,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import type { EditableProductFields } from "@sellbridge/shared/supplier-panel-catalog-status";
import { attributeFieldLabel } from "@sellbridge/shared/supplier-product-attributes";
import {
  formatNcm,
  readProductFiscal,
  type ProductFiscal,
} from "@sellbridge/shared/product-fiscal";

/** The form's steps, in order; a field key decides which step shows it. */
export const FORM_STEPS = [
  { id: "category", label: "Categoria" },
  { id: "details", label: "Dados obrigatórios" },
  { id: "images", label: "Imagens" },
  { id: "review", label: "Revisão" },
] as const;
export type FormStepId = (typeof FORM_STEPS)[number]["id"];

/** The attributes the "Dados obrigatórios" step always offers, besides the category's own. */
export const COMMON_ATTRIBUTES = [
  "BRAND",
  "MODEL",
  "GTIN",
  "SELLER_PACKAGE_WEIGHT",
  "SELLER_PACKAGE_HEIGHT",
  "SELLER_PACKAGE_WIDTH",
  "SELLER_PACKAGE_LENGTH",
].map((id) => ({ id, label: attributeFieldLabel(id) }));

export interface PanelFormValues {
  sku: string;
  title: string;
  description: string;
  cost: string;
  suggestedPrice: string;
  stock: string;
  categoryId: string;
  imageUrls: readonly string[];
  attributes: Readonly<Record<string, string>>;
  fiscal: FiscalFormValues;
}

/** The NF-e fields as typed; every one is text, "" while empty. */
export interface FiscalFormValues {
  ncm: string;
  origin: string;
  unit: string;
  cest: string;
  netWeight: string;
  cfopInState: string;
  cfopOutOfState: string;
  icmsCode: string;
  pisCofinsCst: string;
}

const FISCAL_KEYS = [
  "ncm",
  "origin",
  "unit",
  "cest",
  "netWeight",
  "cfopInState",
  "cfopOutOfState",
  "icmsCode",
  "pisCofinsCst",
] as const satisfies readonly (keyof FiscalFormValues)[];

/** Form key → product field key ("netWeight" is stored as `netWeightGrams`). */
const FISCAL_FIELD_OF: Readonly<Record<keyof FiscalFormValues, keyof ProductFiscal>> = {
  ncm: "ncm",
  origin: "origin",
  unit: "unit",
  cest: "cest",
  netWeight: "netWeightGrams",
  cfopInState: "cfopInState",
  cfopOutOfState: "cfopOutOfState",
  icmsCode: "icmsCode",
  pisCofinsCst: "pisCofinsCst",
};

export const EMPTY_FISCAL_FORM_VALUES: FiscalFormValues = {
  ncm: "",
  origin: "",
  unit: "",
  cest: "",
  netWeight: "",
  cfopInState: "",
  cfopOutOfState: "",
  icmsCode: "",
  pisCofinsCst: "",
};

/** A product's stored NF-e data as the form fields show it. */
export function fiscalFormValues(stored: unknown): FiscalFormValues {
  const fiscal = readProductFiscal(stored);
  return {
    ncm: fiscal.ncm === null ? "" : formatNcm(fiscal.ncm),
    origin: textOf(fiscal.origin),
    unit: textOf(fiscal.unit),
    cest: textOf(fiscal.cest),
    netWeight: textOf(fiscal.netWeightGrams),
    cfopInState: textOf(fiscal.cfopInState),
    cfopOutOfState: textOf(fiscal.cfopOutOfState),
    icmsCode: textOf(fiscal.icmsCode),
    pisCofinsCst: textOf(fiscal.pisCofinsCst),
  };
}

function textOf(value: string | number | null): string {
  return value === null ? "" : String(value);
}

function textOrNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

/** Whole numbers as numbers; a typo becomes NaN so the schema names the field. */
function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** What the fields hold as the product stores it: blanks are null, numbers are numbers. */
export function fiscalCandidate(values: FiscalFormValues) {
  return {
    ncm: textOrNull(values.ncm),
    origin: numberOrNull(values.origin),
    unit: textOrNull(values.unit),
    cest: textOrNull(values.cest),
    netWeightGrams: numberOrNull(values.netWeight),
    cfopInState: textOrNull(values.cfopInState),
    cfopOutOfState: textOrNull(values.cfopOutOfState),
    icmsCode: textOrNull(values.icmsCode),
    pisCofinsCst: textOrNull(values.pisCofinsCst),
  };
}

/** The fiscal data as completeness reads it while typing: a value with a typo counts as missing. */
export function fiscalForCompleteness(values: FiscalFormValues): ProductFiscal {
  return readProductFiscal(fiscalCandidate(values));
}

export function stepOfField(field: string): FormStepId {
  if (field === "categoryId") {
    return "category";
  }
  if (field === "imageUrls") {
    return "images";
  }
  return "details";
}

/** The DOM id of a field's input, so "Corrigir" and rejection reasons can focus it. */
export function inputIdOf(field: string): string {
  return `panel-product-${field.replace(".", "-")}`;
}

export function panelFormValues(product?: EditableProductFields | null): PanelFormValues {
  return {
    sku: product?.sku ?? "",
    title: product?.title ?? "",
    description: product?.description ?? "",
    cost: product === undefined || product === null ? "" : formatCentsForInput(product.costCents),
    suggestedPrice:
      product === undefined || product === null
        ? ""
        : formatCentsForInput(product.suggestedPriceCents),
    stock: product === undefined || product === null ? "" : String(product.stock),
    categoryId: product?.categoryId ?? "",
    imageUrls: product?.imageUrls ?? [],
    attributes: product?.mercadoLivreAttributes ?? {},
    fiscal: fiscalFormValues(product?.fiscal),
  };
}

function wholeUnits(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : 0;
}

/** Filled attributes only: an emptied field removes the attribute instead of storing "". */
function filledAttributes(attributes: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes)
      .map(([id, value]) => [id, value.trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
}

/** What completeness is scored on while typing: blanks and typos count as missing. */
export function completenessInput(values: PanelFormValues): CompletenessProduct {
  return {
    sku: values.sku,
    title: values.title,
    description: values.description,
    costCents: parseCsvMoney(values.cost) ?? 0,
    stock: wholeUnits(values.stock),
    categoryId: values.categoryId === "" ? null : values.categoryId,
    imageUrls: values.imageUrls,
    mercadoLivreAttributes: filledAttributes(values.attributes),
  };
}

export type DraftParse =
  { ok: true; values: CatalogDraftValues } | { ok: false; errors: Record<string, string> };

/**
 * The values to autosave. Money and units must be typed correctly to be sent: a half-typed
 * "12," waits for the next keystroke instead of saving a wrong amount. A shelf below zero
 * (shipped past the last count) saves as it is; only typing a new negative count is refused.
 */
export function parseDraft(values: PanelFormValues, expectedStock?: number): DraftParse {
  const costCents = values.cost.trim() === "" ? 0 : parseCsvMoney(values.cost);
  const suggestedPriceCents =
    values.suggestedPrice.trim() === "" ? 0 : parseCsvMoney(values.suggestedPrice);
  const stock = values.stock.trim() === "" ? 0 : Number(values.stock.trim());
  const parsed = catalogDraftValuesSchema.safeParse({
    sku: values.sku,
    title: values.title,
    description: values.description,
    costCents: costCents ?? Number.NaN,
    suggestedPriceCents: suggestedPriceCents ?? Number.NaN,
    stock,
    categoryId: values.categoryId === "" ? null : values.categoryId,
    imageUrls: [...values.imageUrls],
    mercadoLivreAttributes: filledAttributes(values.attributes),
    fiscal: fiscalCandidate(values.fiscal),
  });
  if (parsed.success && !keepsNegativeShelfOnly(parsed.data.stock, expectedStock)) {
    return { ok: false, errors: { stock: NEGATIVE_STOCK_MESSAGE } };
  }
  if (parsed.success) {
    return { ok: true, values: parsed.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const [root, key] = issue.path.map(String);
    const field = errorFieldOf(root, key);
    // A half-typed amount ("12,") reaches the schema as NaN: the hint fits better than a message
    // about the value received, which the supplier is still typing.
    errors[field] ??=
      issue.code === "invalid_type" || /^(Invalid|Too|Expected)\b/.test(issue.message)
        ? "Valor inválido, revise o campo."
        : issue.message;
  }
  return { ok: false, errors };
}

function errorFieldOf(root: string | undefined, key: string | undefined): string {
  if (root === "mercadoLivreAttributes") {
    return `attributes.${key ?? ""}`;
  }
  if (root === "fiscal") {
    return `fiscal.${key ?? ""}`;
  }
  return root ?? "form";
}

/** Under the description: progress toward the recommended length, then only that it is met. */
export function descriptionLengthHint(length: number): string {
  if (length >= MIN_DESCRIPTION_LENGTH) {
    return `${length} caracteres: tamanho recomendado atingido`;
  }
  return `${length} de ${MIN_DESCRIPTION_LENGTH} caracteres recomendados`;
}

/** The product field each text input feeds, as reasons and completeness name it. */
const TEXT_FIELDS = [
  ["sku", "sku"],
  ["title", "title"],
  ["description", "description"],
  ["cost", "costCents"],
  ["suggestedPrice", "suggestedPriceCents"],
  ["stock", "stock"],
  ["categoryId", "categoryId"],
] as const;

function changedAttributes(initial: PanelFormValues, current: PanelFormValues): string[] {
  const ids = new Set([...Object.keys(initial.attributes), ...Object.keys(current.attributes)]);
  return [...ids]
    .filter((id) => (initial.attributes[id] ?? "").trim() !== (current.attributes[id] ?? "").trim())
    .map((id) => `attributes.${id}`);
}

function changedFiscal(initial: PanelFormValues, current: PanelFormValues): string[] {
  return FISCAL_KEYS.filter((key) => initial.fiscal[key].trim() !== current.fiscal[key].trim()).map(
    (key) => `fiscal.${FISCAL_FIELD_OF[key]}`,
  );
}

/**
 * Fields the supplier changed since the form opened, by product field key: a rejection reason
 * on one of them reads as being fixed instead of staying an open alarm.
 */
export function editedFields(
  initial: PanelFormValues,
  current: PanelFormValues,
): ReadonlySet<string> {
  const texts = TEXT_FIELDS.filter(([key]) => initial[key].trim() !== current[key].trim()).map(
    ([, field]) => field,
  );
  const images =
    JSON.stringify(initial.imageUrls) === JSON.stringify(current.imageUrls) ? [] : ["imageUrls"];
  return new Set([
    ...texts,
    ...images,
    ...changedAttributes(initial, current),
    ...changedFiscal(initial, current),
  ]);
}
