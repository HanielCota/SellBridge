import { REVIEW_TAGS, type ReviewAspect, type ReviewTag } from "@sellbridge/shared/schemas";
import type { AspectCounts, SupplierReputationStats } from "@sellbridge/shared/supplier-score";

/** How many reviews ticked one reason, as the Avaliações section lists it. */
export interface ReviewTagCount {
  tag: ReviewTag;
  count: number;
}

/**
 * The public score's reviews in plain counts: how many praise, how many are neutral, how many
 * complain, and the reasons most ticked on each side. Comments stay with moderation.
 */
export interface ReviewSummary {
  /** 4 and 5 stars. */
  positive: number;
  /** 3 stars. */
  neutral: number;
  /** 1 and 2 stars. */
  negative: number;
  /** Praise reasons, most ticked first; reasons nobody ticked are left out. */
  praise: ReviewTagCount[];
  /** Complaint reasons, most ticked first. */
  complaints: ReviewTagCount[];
}

/** Which aspect and side each reason counts on, as the public score tallies them. */
const TAG_PARTS: Record<ReviewTag, { aspect: ReviewAspect; side: keyof AspectCounts }> = {
  "dispatch:good": { aspect: "dispatch", side: "good" },
  "dispatch:bad": { aspect: "dispatch", side: "bad" },
  "conformity:good": { aspect: "conformity", side: "good" },
  "conformity:bad": { aspect: "conformity", side: "bad" },
  "packaging:good": { aspect: "packaging", side: "good" },
  "packaging:bad": { aspect: "packaging", side: "bad" },
  "support:good": { aspect: "support", side: "good" },
  "support:bad": { aspect: "support", side: "bad" },
};

function countOf(stats: SupplierReputationStats, tag: ReviewTag): number {
  const { aspect, side } = TAG_PARTS[tag];
  return stats.aspects[aspect][side];
}

/** Most ticked first; a tie keeps the order of `REVIEW_TAGS`, so the list never jumps. */
function rankedTags(stats: SupplierReputationStats, side: keyof AspectCounts): ReviewTagCount[] {
  return REVIEW_TAGS.filter((tag) => TAG_PARTS[tag].side === side)
    .map((tag) => ({ tag, count: countOf(stats, tag) }))
    .filter((entry) => entry.count > 0)
    .toSorted((first, second) => second.count - first.count);
}

export function reviewSummaryOf(stats: SupplierReputationStats): ReviewSummary {
  return {
    positive: stats.positiveCount,
    neutral: stats.neutralCount,
    negative: stats.negativeCount,
    praise: rankedTags(stats, "good"),
    complaints: rankedTags(stats, "bad"),
  };
}
