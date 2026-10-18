import { z } from "zod";
import { pageNumberSchema, searchQuery } from "../schemas/common.ts";
import { optionalParameter, withFallback } from "../schemas/fallback.ts";
import type { RejectionReason } from "./supplier-panel-catalog-status.ts";
import { attributeLabel, PRODUCT_ATTRIBUTES } from "./supplier-product-attributes.ts";

/**
 * The admin's queue of supplier products waiting for review (the platform's side of the
 * supplier panel's approval flow). Oldest submission first, so nobody waits behind newer work.
 */
export const REVIEW_QUEUE_PAGE_SIZE = 25;

export const reviewQueueSearchSchema = z.object({
  query: optionalParameter(searchQuery()),
  page: withFallback(pageNumberSchema.default(1), 1),
});
export type ReviewQueueSearch = z.infer<typeof reviewQueueSearchSchema>;

export const reviewProductInputSchema = z.object({ productId: z.uuid() });

/**
 * First review of a new product, a product sent again after a rejection (its reasons stay
 * until approval), or a new look at one already sold that changed its listing.
 */
export type ReviewKind = "new" | "resubmission" | "change";

export function reviewKindOf(product: {
  reviewedAt: Date | null;
  rejectionReasons: readonly RejectionReason[];
}): ReviewKind {
  if (product.rejectionReasons.length > 0) {
    return "resubmission";
  }
  return product.reviewedAt === null ? "new" : "change";
}

export const REVIEW_KIND_LABELS: Readonly<Record<ReviewKind, string>> = {
  new: "Produto novo",
  resubmission: "Reenvio",
  change: "Alteração",
};

/** Product fields a reviewer can point a reason at, in the order the form shows them. */
export const REVIEW_FIELDS = [
  "title",
  "imageUrls",
  "categoryId",
  "description",
  "sku",
  "costCents",
  "suggestedPriceCents",
  "stock",
] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];

export const REVIEW_FIELD_LABELS: Readonly<Record<ReviewField, string>> = {
  title: "Título",
  imageUrls: "Imagens",
  categoryId: "Categoria",
  description: "Descrição",
  sku: "SKU",
  costCents: "Custo",
  suggestedPriceCents: "Preço sugerido",
  stock: "Estoque",
};

/**
 * Common refusals, each with the field it usually concerns and a ready message the reviewer
 * may edit. A refusal always names what to fix: never "reprovado" with nothing else.
 */
export const REVIEW_REASON_PRESETS = [
  {
    rule: "image_quality",
    label: "Imagem fora do padrão",
    field: "imageUrls",
    message:
      "A imagem principal precisa ter fundo branco, sem texto ou logotipo, e pelo menos 1200 px.",
  },
  {
    rule: "title_policy",
    label: "Título fora do padrão",
    field: "title",
    message:
      "Use no título o nome do produto, a marca e o modelo, sem promoções, emojis ou letras maiúsculas em excesso.",
  },
  {
    rule: "wrong_category",
    label: "Categoria errada",
    field: "categoryId",
    message: "A categoria escolhida não corresponde ao produto. Escolha a categoria correta.",
  },
  {
    rule: "missing_information",
    label: "Informação incompleta",
    field: "description",
    message:
      "A descrição precisa dizer o material, as medidas e o que vem na embalagem para o comprador decidir.",
  },
  {
    rule: "price_inconsistent",
    label: "Preço incoerente",
    field: "suggestedPriceCents",
    message:
      "O preço sugerido está abaixo do custo ou muito acima do mercado. Revise os dois valores.",
  },
  {
    rule: "prohibited_item",
    label: "Produto proibido",
    field: "title",
    message:
      "Este produto está na lista de itens proibidos dos marketplaces atendidos pela SellBridge.",
  },
  {
    rule: "other",
    label: "Outro motivo",
    field: "title",
    message: "",
  },
] as const satisfies ReadonlyArray<{
  rule: string;
  label: string;
  field: ReviewField;
  message: string;
}>;
export type ReviewReasonRule = (typeof REVIEW_REASON_PRESETS)[number]["rule"];

/** The reason a preset starts from, so the reviewer only edits what is specific to this product. */
export function reasonFromPreset(rule: ReviewReasonRule): RejectionReason {
  const preset = REVIEW_REASON_PRESETS.find((candidate) => candidate.rule === rule);
  if (preset === undefined) {
    return { field: "title", rule: "other", message: "" };
  }
  return { field: preset.field, rule: preset.rule, message: preset.message };
}

const ATTRIBUTE_PREFIX = "attributes.";

/** Plain-language label for a reason's field, including a Mercado Livre attribute. */
export function reviewFieldLabel(field: string): string {
  if (field.startsWith(ATTRIBUTE_PREFIX)) {
    return attributeLabel(field.slice(ATTRIBUTE_PREFIX.length));
  }
  const known = REVIEW_FIELDS.find((candidate) => candidate === field);
  return known === undefined ? field : REVIEW_FIELD_LABELS[known];
}

/**
 * Titles of the completeness items (`supplier-panel-catalog-completeness.ts`) a reviewer can
 * click into a reason, so the reason reads as words and never as its rule code.
 */
const COMPLETENESS_RULE_TITLES: Readonly<Record<string, string>> = {
  sku_required: "SKU ausente",
  title_min_length: "Título curto",
  cost_required: "Custo ausente",
  stock_required: "Estoque zerado",
  category_required: "Sem categoria",
  image_required: "Sem imagem",
  attribute_required: "Ficha técnica incompleta",
  description_min_length: "Descrição curta",
  images_recommended: "Poucas imagens",
  gtin_recommended: "Código de barras ausente",
  package_recommended: "Embalagem sem peso ou medidas",
  brand_recommended: "Marca ausente",
  model_recommended: "Modelo ausente",
};

export const OTHER_REASON_TITLE = "Outro motivo";

export function reviewReasonTitle(rule: string): string {
  const preset = REVIEW_REASON_PRESETS.find((candidate) => candidate.rule === rule);
  return preset?.label ?? COMPLETENESS_RULE_TITLES[rule] ?? OTHER_REASON_TITLE;
}

export interface ReviewFieldOption {
  value: string;
  label: string;
}

/**
 * Fields a reason can point at: the product's own fields, then its datasheet in the form's
 * order, plus any field a reason already names (a completeness item on an empty attribute).
 */
export function reviewFieldOptions(
  attributeIds: readonly string[],
  reasonFields: readonly string[],
): ReviewFieldOption[] {
  const attributeFields = [
    ...PRODUCT_ATTRIBUTES.map((attribute) => attribute.id).filter((id) =>
      attributeIds.includes(id),
    ),
    ...attributeIds.filter((id) => !PRODUCT_ATTRIBUTES.some((attribute) => attribute.id === id)),
  ].map((id) => `${ATTRIBUTE_PREFIX}${id}`);
  const values = [...new Set<string>([...REVIEW_FIELDS, ...attributeFields, ...reasonFields])];
  return values.map((value) => ({ value, label: reviewFieldLabel(value) }));
}
