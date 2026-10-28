import {
  changedProductFields,
  statusAfterEdit,
  type EditableProductFields,
  type ProductReviewStatus,
} from "./supplier-panel-catalog-status.ts";

export interface ImportedProductStatus {
  readonly reviewStatus: ProductReviewStatus;
  readonly submittedAt: Date | null;
}

/**
 * The review status a row of the supplier's own spreadsheet lands in, by the panel form's rules:
 * a new product goes to review (or stays a draft while something blocks publishing), an existing
 * one follows `statusAfterEdit`. The admin's import follows it too (decided on 2026-10-25).
 */
export function supplierImportStatus(input: {
  previous: (EditableProductFields & ImportedProductStatus) | undefined;
  next: EditableProductFields;
  blockingIssueCount: number;
  now: Date;
}): ImportedProductStatus {
  const { previous } = input;
  if (previous === undefined) {
    const reviewStatus = input.blockingIssueCount > 0 ? "draft" : "in_review";
    return { reviewStatus, submittedAt: reviewStatus === "in_review" ? input.now : null };
  }
  const reviewStatus = statusAfterEdit({
    current: previous.reviewStatus,
    changedFields: changedProductFields(previous, input.next),
    blockingIssueCount: input.blockingIssueCount,
  });
  const resubmitted = reviewStatus === "in_review" && previous.reviewStatus !== "in_review";
  return { reviewStatus, submittedAt: resubmitted ? input.now : previous.submittedAt };
}
