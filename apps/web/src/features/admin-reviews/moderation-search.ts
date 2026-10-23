import { pageNumberSchema, withFallback } from "@sellbridge/shared/schemas";
import { z } from "zod";

/** Short pages: each review is a few lines of text to read, not a row to scan. */
export const MODERATED_REVIEWS_PAGE_SIZE = 10;

/**
 * `/admin/avaliacoes` address: the page and the "Só com comentário" filter, on by default since
 * the comments are what moderation is there to read. A hand-edited value falls back to them.
 */
export const moderationSearchSchema = z.object({
  page: withFallback(pageNumberSchema.default(1), 1),
  withComment: withFallback(z.boolean().default(true), true),
});

export type ModerationSearch = z.infer<typeof moderationSearchSchema>;

/** Input of the moderation server function: one supplier (its admin page) or all of them. */
export const moderatedReviewsInputSchema = z.object({
  supplierId: z.uuid().optional(),
  withCommentOnly: z.boolean(),
  page: pageNumberSchema.default(1),
});

export type ModeratedReviewsInput = z.input<typeof moderatedReviewsInputSchema>;
