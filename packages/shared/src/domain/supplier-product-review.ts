import { z } from "zod";
import { pageNumberSchema, searchQuery } from "../schemas/common.ts";
import { optionalParameter, withFallback } from "../schemas/fallback.ts";
import type { RejectionReason } from "./supplier-panel-catalog-status.ts";

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

/** First review of a new product, or a new look at one already sold that changed its listing. */
export type ReviewKind = "new" | "change";

export function reviewKindOf(product: { reviewedAt: Date | null }): ReviewKind {
  return product.reviewedAt === null ? "new" : "change";
}

export const REVIEW_KIND_LABELS: Readonly<Record<ReviewKind, string>> = {
  new: "Produto novo",
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

/** Plain-language label for a reason's field, including a Mercado Livre attribute. */
export function reviewFieldLabel(field: string): string {
  if (field.startsWith("attributes.")) {
    return `Ficha técnica (${field.slice("attributes.".length)})`;
  }
  const known = REVIEW_FIELDS.find((candidate) => candidate === field);
  return known === undefined ? field : REVIEW_FIELD_LABELS[known];
}
