import { z } from "zod";
import { redactContactDetails } from "../domain/contact-details.ts";
import { optionalParameter, withFallback } from "./fallback.ts";

export { redactContactDetails };

/** What a reseller can praise or criticize about a supplier in one order. */
export const REVIEW_ASPECTS = ["dispatch", "conformity", "packaging", "support"] as const;
export type ReviewAspect = (typeof REVIEW_ASPECTS)[number];

export const REVIEW_ASPECT_LABELS: Record<ReviewAspect, string> = {
  dispatch: "Prazo de despacho",
  conformity: "Produto conforme o anúncio",
  packaging: "Embalagem",
  support: "Atendimento",
};

/** Each aspect has a praise tag (`:good`) and a complaint tag (`:bad`). */
export const REVIEW_TAGS = [
  "dispatch:good",
  "dispatch:bad",
  "conformity:good",
  "conformity:bad",
  "packaging:good",
  "packaging:bad",
  "support:good",
  "support:bad",
] as const;
export const reviewTagSchema = z.enum(REVIEW_TAGS);
export type ReviewTag = z.infer<typeof reviewTagSchema>;

export const REVIEW_TAG_LABELS: Record<ReviewTag, string> = {
  "dispatch:good": "Despachou no prazo",
  "dispatch:bad": "Atrasou o despacho",
  "conformity:good": "Conforme o anúncio",
  "conformity:bad": "Diferente do anúncio",
  "packaging:good": "Boa embalagem",
  "packaging:bad": "Chegou avariado",
  "support:good": "Atendimento rápido",
  "support:bad": "Demorou a responder",
};

export const REVIEW_COMMENT_MAX_LENGTH = 500;

/** Four or five stars praise the supplier; three or fewer point out what went wrong. */
export function isPraiseRating(rating: number): boolean {
  return rating >= 4;
}

/** The tags offered for a rating: praise for good ratings, complaints for the others. */
export function tagsForRating(rating: number): readonly ReviewTag[] {
  const suffix = isPraiseRating(rating) ? ":good" : ":bad";
  return REVIEW_TAGS.filter((tag) => tag.endsWith(suffix));
}

export const supplierReviewInputSchema = z
  .object({
    orderId: z.uuid(),
    supplierId: z.uuid(),
    rating: z.number().int().min(1).max(5),
    tags: z.array(reviewTagSchema).max(REVIEW_TAGS.length),
    comment: z.string().trim().max(REVIEW_COMMENT_MAX_LENGTH),
  })
  .refine((review) => review.tags.every((tag) => tagsForRating(review.rating).includes(tag)), {
    message: "As marcações não combinam com a nota",
    path: ["tags"],
  })
  // Other resellers read the comment: contact details (e-mail, phone, store link) are removed.
  .transform((review) => ({
    ...review,
    tags: [...new Set(review.tags)],
    comment: redactContactDetails(review.comment),
  }));

export type SupplierReviewInput = z.infer<typeof supplierReviewInputSchema>;

export const REVIEW_FILTERS = ["pending", "done", "all"] as const;
export const reviewFilterSchema = z.enum(REVIEW_FILTERS);
export type ReviewFilter = z.infer<typeof reviewFilterSchema>;

export const REVIEW_FILTER_LABELS: Record<ReviewFilter, string> = {
  pending: "Para avaliar",
  done: "Avaliados",
  all: "Todos",
};

/** Search params of the orders page: one row per order and supplier. */
export const orderReviewSearchSchema = z.object({
  review: withFallback(reviewFilterSchema.default("pending"), "pending"),
  query: optionalParameter(z.string().trim().max(100)),
  page: withFallback(z.coerce.number().int().min(1).default(1), 1),
  pageSize: withFallback(z.coerce.number().int().min(10).max(100).default(20), 20),
});

export type OrderReviewSearch = z.infer<typeof orderReviewSearchSchema>;
