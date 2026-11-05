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
 * The status a row of the supplier's own spreadsheet lands in, by the panel form's rules: a new
 * product is approved (or stays a draft while something blocks publishing), an existing one
 * follows `statusAfterEdit`. The admin's import follows it too (decided on 2026-10-25); there is
 * no team review since 2026-11-04.
 */
export function supplierImportStatus(input: {
  previous: (EditableProductFields & ImportedProductStatus) | undefined;
  next: EditableProductFields;
  blockingIssueCount: number;
  prohibited: boolean;
  now: Date;
}): ImportedProductStatus {
  const { previous } = input;
  if (previous === undefined) {
    const reviewStatus = input.blockingIssueCount > 0 ? "draft" : "approved";
    return { reviewStatus, submittedAt: reviewStatus === "approved" ? input.now : null };
  }
  const reviewStatus = statusAfterEdit({
    current: previous.reviewStatus,
    changedFields: changedProductFields(previous, input.next),
    blockingIssueCount: input.blockingIssueCount,
    prohibited: input.prohibited,
  });
  const published = reviewStatus === "approved" && previous.reviewStatus !== "approved";
  return { reviewStatus, submittedAt: published ? input.now : previous.submittedAt };
}
