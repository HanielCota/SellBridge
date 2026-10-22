import { REVIEW_TAG_LABELS, reviewTagSchema } from "@sellbridge/shared/schemas";

/** Reason labels of a review, in its order; tags the app no longer knows are skipped. */
export function reasonLabels(tags: readonly string[]): string[] {
  return tags.flatMap((tag) => {
    const parsed = reviewTagSchema.safeParse(tag);
    return parsed.success ? [REVIEW_TAG_LABELS[parsed.data]] : [];
  });
}

/** A comment left blank, or only spaces, reads as no comment. */
export function hasComment(comment: string): boolean {
  return comment.trim() !== "";
}

/**
 * The supplier has no review at all. A page past the end (reviews removed while paging) is
 * not "no reviews": it keeps the pager, so the reader can step back.
 */
export function hasNoReviews(list: { total: number }): boolean {
  return list.total === 0;
}
