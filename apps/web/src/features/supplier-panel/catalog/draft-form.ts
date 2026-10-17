import { formatCentsForInput } from "@sellbridge/shared/money";
import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import {
  catalogDraftValuesSchema,
  type CatalogDraftValues,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import type { CompletenessProduct } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import type { EditableProductFields } from "@sellbridge/shared/supplier-panel-catalog-status";

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
  { id: "BRAND", label: "Marca" },
  { id: "MODEL", label: "Modelo" },
  { id: "GTIN", label: "Código de barras (GTIN)" },
  { id: "SELLER_PACKAGE_WEIGHT", label: "Peso da embalagem (g)" },
  { id: "SELLER_PACKAGE_HEIGHT", label: "Altura (cm)" },
  { id: "SELLER_PACKAGE_WIDTH", label: "Largura (cm)" },
  { id: "SELLER_PACKAGE_LENGTH", label: "Comprimento (cm)" },
] as const;

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
    errors[field] ??= /^(Invalid|Too|Expected)\b/.test(issue.message)
      ? "Valor inválido. Revise este campo."
      : issue.message;
  }
  return { ok: false, errors };
}
