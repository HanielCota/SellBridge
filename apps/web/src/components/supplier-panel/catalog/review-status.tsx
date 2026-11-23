import type { SupplierPanelProduct } from "@sellbridge/database/repositories";
import type { CompletenessReport } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import {
  PRODUCT_REVIEW_STATUS_LABELS,
  type ProductReviewStatus,
} from "@sellbridge/shared/supplier-panel-catalog-status";
import { type StatusTone, TonePill } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";
import {
  completenessLabel,
  completenessTier,
  type CompletenessTier,
} from "@/features/supplier-panel/catalog/completeness-wording";

const REVIEW_TONES: Readonly<Record<ProductReviewStatus, StatusTone>> = {
  draft: "muted",
  in_review: "info",
  approved: "success",
  rejected: "danger",
};

export function ReviewStatus({ status }: { status: ProductReviewStatus }) {
  return <TonePill tone={REVIEW_TONES[status]} label={PRODUCT_REVIEW_STATUS_LABELS[status]} />;
}

/** The review status, plus "Desativado" while the product is off sale. */
export function ProductStatus({ product }: { product: SupplierPanelProduct }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <ReviewStatus status={product.reviewStatus} />
      {product.active ? null : <TonePill tone="muted" label="Desativado" />}
    </span>
  );
}

const TIER_TONES: Readonly<Record<CompletenessTier, string>> = {
  blocked: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  pending_on_sale: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  improvable: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

const TIER_HINTS: Readonly<Record<CompletenessTier, string>> = {
  blocked: TERM_HINTS.blockingPublish,
  pending_on_sale: TERM_HINTS.pendingOnSale,
  improvable: TERM_HINTS.canImprove,
  complete: TERM_HINTS.completeListing,
};

/** Score plus why, in words: never a bare percentage the supplier has to interpret. */
export function CompletenessBadge({
  score,
  blocking,
  onSale = false,
}: {
  score: number;
  blocking: number;
  /** Approved and active: missing data no longer stops it from selling. */
  onSale?: boolean;
}) {
  const tier = completenessTier({ score, blocking, onSale });
  // The label may break onto a second line: "À venda · N dados a completar" is the longest one,
  // and on one line it pushed the products table past a 1280 px screen.
  return (
    <HintedText label={TIER_HINTS[tier]}>
      <span
        className={cn(
          "inline-flex flex-wrap items-center gap-x-1.5 rounded-2xl px-2.5 py-0.5 text-footnote font-medium tabular-nums",
          TIER_TONES[tier],
        )}
      >
        <span className="whitespace-nowrap">{score}%</span>
        <span className="font-normal opacity-80">· {completenessLabel(tier, blocking)}</span>
      </span>
    </HintedText>
  );
}

const FISCAL_RULES: ReadonlySet<string> = new Set(["fiscal_required", "fiscal_recommended"]);

/**
 * A product whose NF-e cannot be issued yet. The completeness already counts the origin and unit
 * saved in Marca, so a product missing only those while Marca has them shows nothing.
 */
export function MissingFiscalBadge({ completeness }: { completeness: CompletenessReport }) {
  const issue = [...completeness.blocking, ...completeness.fiscal].find((candidate) =>
    FISCAL_RULES.has(candidate.rule),
  );
  if (issue === undefined) {
    return null;
  }
  return (
    <HintedText label={issue.message}>
      <span className="inline-flex items-center rounded-full bg-amber-700 px-2.5 py-0.5 text-footnote font-semibold whitespace-nowrap text-white">
        {issue.field === "fiscal.ncm" ? "Falta NCM" : "Falta dado da nota"}
      </span>
    </HintedText>
  );
}
