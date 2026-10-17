import { formatCentsForInput } from "@sellbridge/shared/money";
import { parseCsvMoney } from "@sellbridge/shared/product-csv";
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
 * "12," waits for the next keystroke instead of saving a wrong amount.
 */
export function parseDraft(values: PanelFormValues): DraftParse {
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
  });
  if (parsed.success) {
    return { ok: true, values: parsed.data };
  }
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const [root, key] = issue.path.map(String);
    const field = root === "mercadoLivreAttributes" ? `attributes.${key ?? ""}` : (root ?? "form");
    // A half-typed amount ("12,") reaches the schema as NaN: the hint fits better than a message
    // about the value received, which the supplier is still typing.
    errors[field] ??=
      issue.code === "invalid_type" || /^(Invalid|Too|Expected)\b/.test(issue.message)
        ? "Valor inválido, revise o campo."
        : issue.message;
  }
  return { ok: false, errors };
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
  return new Set([...texts, ...images, ...changedAttributes(initial, current)]);
}
