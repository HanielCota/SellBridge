import type { BulkPublishSkip, BulkPublishSkipReason } from "@sellbridge/shared/bulk-publish-plan";

/** Why a product of a bulk publication stayed out, as the reseller reads it. */
export const BULK_SKIP_REASONS: Readonly<Record<BulkPublishSkipReason, string>> = {
  already_published: "já publicado",
  out_of_stock: "sem estoque",
  invalid_title: "título curto ou inválido",
  invalid_description: "descrição curta ou inválida",
  unavailable: "fora do catálogo",
};

const BULK_SKIP_REASON_ORDER: readonly BulkPublishSkipReason[] = [
  "already_published",
  "out_of_stock",
  "invalid_title",
  "invalid_description",
  "unavailable",
];

/** "2 já publicado, 1 sem estoque": every reason with its count, in the order above. */
export function skippedSummary(skipped: readonly BulkPublishSkip[]): string {
  const counts = new Map<BulkPublishSkipReason, number>();
  for (const skip of skipped) {
    counts.set(skip.reason, (counts.get(skip.reason) ?? 0) + 1);
  }
  return BULK_SKIP_REASON_ORDER.flatMap((reason) => {
    const count = counts.get(reason) ?? 0;
    return count === 0 ? [] : [`${count} ${BULK_SKIP_REASONS[reason]}`];
  }).join(", ");
}
