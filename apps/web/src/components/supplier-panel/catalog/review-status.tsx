import type { SupplierPanelProduct } from "@sellbridge/database/repositories";
import { hasRequiredFiscalData, readProductFiscal } from "@sellbridge/shared/product-fiscal";
import {
  PRODUCT_REVIEW_STATUS_LABELS,
  type ProductReviewStatus,
} from "@sellbridge/shared/supplier-panel-catalog-status";
import { type StatusTone, TonePill } from "@/components/data/tone-status";
import { cn } from "@/lib/utils";
import { TERM_HINTS } from "@/components/icons/action-icons";
import { HintedText } from "@/components/ui/hint";

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

/** Score tiers: what blocks publishing reads red even at a high score. */
function completenessTone(score: number, blocking: number): string {
  if (blocking > 0) {
    return "bg-destructive/10 text-destructive dark:bg-destructive/20";
  }
  if (score < 100) {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

function completenessLabel(score: number, blocking: number): string {
  if (blocking > 0) {
    return `${blocking} ${blocking === 1 ? "impede" : "impedem"} publicar`;
  }
  return score === 100 ? "Anúncio completo" : "Pode melhorar";
}

function completenessHint(score: number, blocking: number): string {
  if (blocking > 0) {
    return TERM_HINTS.blockingPublish;
  }
  return score === 100 ? TERM_HINTS.completeListing : TERM_HINTS.canImprove;
}

/** Score plus why, in words: never a bare percentage the supplier has to interpret. */
export function CompletenessBadge({ score, blocking }: { score: number; blocking: number }) {
  return (
    <HintedText label={completenessHint(score, blocking)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-footnote font-medium whitespace-nowrap tabular-nums",
          completenessTone(score, blocking),
        )}
      >
        <span>{score}%</span>
        <span className="font-normal opacity-80">· {completenessLabel(score, blocking)}</span>
      </span>
    </HintedText>
  );
}

/** A product whose NF-e cannot be issued yet: no NCM, origin or unit. It may still be on sale. */
export function MissingFiscalBadge({ fiscal }: { fiscal: unknown }) {
  if (hasRequiredFiscalData(readProductFiscal(fiscal))) {
    return null;
  }
  return (
    <HintedText label="Faltam NCM, origem ou unidade para emitir a nota fiscal. O produto continua à venda.">
      <span className="inline-flex items-center rounded-full bg-amber-700 px-2.5 py-0.5 text-footnote font-semibold whitespace-nowrap text-white">
        Falta NCM
      </span>
    </HintedText>
  );
}
