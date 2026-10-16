import type { BulkPublishSkip } from "@sellbridge/shared/bulk-publish-plan";
import { BULK_SKIP_REASONS, skippedSummary } from "./bulk-skip-reasons";

/**
 * What the bulk dialog says once the batch is out (item 14.c): listings live, failed and
 * still going, and the products that never went, each with its reason. Nothing is rounded up.
 */

export interface BulkPublishTally {
  published: number;
  failed: number;
  pending: number;
  skipped: readonly BulkPublishSkip[];
}

export interface OutcomeLine {
  key: "published" | "failed" | "pending" | "skipped";
  label: string;
  tone: "positive" | "negative" | "neutral";
}

function listingsText(count: number): string {
  return `${count} ${count === 1 ? "anúncio" : "anúncios"}`;
}

function productsText(count: number): string {
  return `${count} ${count === 1 ? "produto" : "produtos"}`;
}

export function bulkPublishOutcome(tally: BulkPublishTally): OutcomeLine[] {
  const lines: OutcomeLine[] = [
    { key: "published", label: `${listingsText(tally.published)} no ar`, tone: "positive" },
    { key: "failed", label: `${listingsText(tally.failed)} com falha`, tone: "negative" },
    {
      key: "pending",
      label: `${listingsText(tally.pending)} ainda publicando`,
      tone: "neutral",
    },
    {
      key: "skipped",
      label: `${productsText(tally.skipped.length)} fora: ${skippedSummary(tally.skipped)}`,
      tone: "neutral",
    },
  ];
  const counts: Record<OutcomeLine["key"], number> = {
    published: tally.published,
    failed: tally.failed,
    pending: tally.pending,
    skipped: tally.skipped.length,
  };
  return lines.filter((line) => counts[line.key] > 0);
}

export function bulkPublishHeading(tally: BulkPublishTally): string {
  if (tally.pending > 0) {
    return "Publicando anúncios";
  }
  if (tally.failed > 0 && tally.published === 0) {
    return "Nenhum anúncio foi ao ar";
  }
  if (tally.failed > 0) {
    return "Concluída com falhas";
  }
  return "Tudo no ar";
}

/** "Garrafa · sem estoque" for the first few products left out; the rest is a count. */
export function skippedDetails(
  skipped: readonly BulkPublishSkip[],
  limit: number,
): { shown: { productId: string; text: string }[]; hidden: number } {
  const shown = skipped.slice(0, limit).map((skip) => ({
    productId: skip.productId,
    text: `${skip.title ?? "Produto"} · ${BULK_SKIP_REASONS[skip.reason]}`,
  }));
  return { shown, hidden: Math.max(0, skipped.length - limit) };
}
