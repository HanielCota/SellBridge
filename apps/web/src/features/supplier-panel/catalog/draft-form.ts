import { saleTermsFormValues, saleTermsInput, type SaleTermsFormValues } from "./sale-terms-form";
import { formatCentsForInput } from "@sellbridge/shared/money";
import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import {
  defaultSuggestedPriceCents,
  keepsNegativeShelfOnly,
  NEGATIVE_STOCK_MESSAGE,
} from "@sellbridge/shared/schemas";
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

/** "Etapa 2 de 4 · Dados obrigatórios": on a phone the tabs show only their numbers. */
export function phoneStepLine(current: FormStepId): string {
  const index = FORM_STEPS.findIndex((step) => step.id === current);
  const step = FORM_STEPS[index];
  if (step === undefined) {
    throw new Error(`Unknown product form step: ${current}`);
  }
  return `Etapa ${index + 1} de ${FORM_STEPS.length} · ${step.label}`;
}

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
  /** The Mercado Livre category whose sheet the form asks; null until one is known. */
  mercadoLivreCategory: MercadoLivreCategoryChoice | null;
  saleTerms: SaleTermsFormValues;
  fiscal: ProductFiscalFormValues;
}

export interface MercadoLivreCategoryChoice {
  readonly id: string;
  readonly name: string;
}

function storedMercadoLivreCategory(
  product: EditableProductFields | null | undefined,
): MercadoLivreCategoryChoice | null {
  const id = product?.mercadoLivreCategoryId ?? null;
  if (id === null) {
    return null;
  }
  return { id, name: product?.mercadoLivreCategoryName ?? id };
}

/** Sent only once a category is known, so a form without the sheet never clears one. */
function mercadoLivreCategoryInput(category: MercadoLivreCategoryChoice | null) {
  if (category === null) {
    return {};
  }
  return { mercadoLivreCategoryId: category.id, mercadoLivreCategoryName: category.name };
}

/** The NF-e fields as typed; every one is text, "" while empty. */
export interface ProductFiscalFormValues {
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
] as const satisfies readonly (keyof ProductFiscalFormValues)[];

/** Form key → product field key ("netWeight" is stored as `netWeightGrams`). */
const FISCAL_FIELD_OF: Readonly<Record<keyof ProductFiscalFormValues, keyof ProductFiscal>> = {
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

export const EMPTY_PRODUCT_FISCAL_FORM_VALUES: ProductFiscalFormValues = {
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
export function productFiscalFormValues(stored: unknown): ProductFiscalFormValues {
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
export function fiscalCandidate(values: ProductFiscalFormValues) {
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
export function fiscalForCompleteness(values: ProductFiscalFormValues): ProductFiscal {
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

const ZERO_SUGGESTED_PRICE_MESSAGE =
  "O preço sugerido precisa ser maior que R$ 0,00. Exemplo: 49,90";

/** The suggested price a typed cost gives (cost + 50%, ending in ,90); blank until it is read. */
export function suggestedPriceFor(cost: string): string {
  const costCents = parseCsvMoney(cost);
  if (costCents === null || costCents <= 0) {
    return "";
  }
  return formatCentsForInput(defaultSuggestedPriceCents(costCents));
}

/**
 * A change to the form with the suggested price following a new cost, while the supplier has not
 * typed a price of their own (it is blank or still the one the old cost gave).
 */
export function withSuggestedPriceFollowingCost(
  values: PanelFormValues,
  change: Partial<PanelFormValues>,
): Partial<PanelFormValues> {
  if (change.cost === undefined) {
    return change;
  }
  const untouched =
    values.suggestedPrice.trim() === "" || values.suggestedPrice === suggestedPriceFor(values.cost);
  return untouched ? { ...change, suggestedPrice: suggestedPriceFor(change.cost) } : change;
}

function suggestedPriceWithoutTyping(costCents: number | null): number {
  return costCents !== null && costCents > 0 ? defaultSuggestedPriceCents(costCents) : 0;
}

function storedSuggestedPrice(product: EditableProductFields): string {
  if (product.suggestedPriceCents > 0) {
    return formatCentsForInput(product.suggestedPriceCents);
  }
  // Saved at zero before the form filled it: shown with the price its cost gives.
  return suggestedPriceFor(formatCentsForInput(product.costCents));
}

export function panelFormValues(product?: EditableProductFields | null): PanelFormValues {
  return {
    sku: product?.sku ?? "",
    title: product?.title ?? "",
    description: product?.description ?? "",
    cost: product === undefined || product === null ? "" : formatCentsForInput(product.costCents),
    suggestedPrice: product === undefined || product === null ? "" : storedSuggestedPrice(product),
    stock: product === undefined || product === null ? "" : String(product.stock),
    categoryId: product?.categoryId ?? "",
    imageUrls: product?.imageUrls ?? [],
    attributes: product?.mercadoLivreAttributes ?? {},
    mercadoLivreCategory: storedMercadoLivreCategory(product),
    saleTerms: saleTermsFormValues(product),
    fiscal: productFiscalFormValues(product?.fiscal),
  };
}

/** What a new product starts with, from the brand the supplier already filled in. */
export interface NewProductDefaults {
  /** Origin and unit set in Marca, so the NF-e rule does not ask for them on every product. */
  readonly fiscal: { readonly origin: number; readonly unit: string } | null;
  /** The category named like the brand's niche ("O que você vende"), when one is. */
  readonly categoryId: string | null;
}

/** The values a product opens with: a new one starts from the brand's defaults. */
export function initialFormValues(
  product: EditableProductFields | null,
  defaults: NewProductDefaults,
): PanelFormValues {
  const values = panelFormValues(product);
  if (product !== null) {
    return values;
  }
  const fiscal =
    defaults.fiscal === null
      ? values.fiscal
      : { ...values.fiscal, origin: String(defaults.fiscal.origin), unit: defaults.fiscal.unit };
  return { ...values, categoryId: defaults.categoryId ?? values.categoryId, fiscal };
}

/** The id of the category named like the brand's niche, or null when none is. */
export function categoryIdOfNiche(
  categories: readonly { id: string; name: string }[],
  niche: string | null,
): string | null {
  if (niche === null) {
    return null;
  }
  return categories.find((category) => category.name === niche.trim())?.id ?? null;
}

/** Whole units only: "1.000" is a thousand, while "1." or "1.0" wait instead of saving 1. */
function parseStockCount(text: string): number {
  if (/^-?\d+$/.test(text)) {
    return Number(text);
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    return Number(text.replaceAll(".", ""));
  }
  return Number.NaN;
}

function wholeUnits(text: string): number {
  const count = parseStockCount(text.trim());
  return Number.isInteger(count) && count > 0 ? count : 0;
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
  if (values.suggestedPrice.trim() !== "" && parseCsvMoney(values.suggestedPrice) === 0) {
    return { ok: false, errors: { suggestedPriceCents: ZERO_SUGGESTED_PRICE_MESSAGE } };
  }
  // Left blank: the price the cost gives, as the spreadsheet import does; zero only with no cost.
  const suggestedPriceCents =
    values.suggestedPrice.trim() === ""
      ? suggestedPriceWithoutTyping(costCents)
      : parseCsvMoney(values.suggestedPrice);
  const stock = values.stock.trim() === "" ? 0 : parseStockCount(values.stock.trim());
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
    ...mercadoLivreCategoryInput(values.mercadoLivreCategory),
    ...saleTermsInput(values.saleTerms),
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
