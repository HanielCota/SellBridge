import type { ProductAwaitingReview } from "@sellbridge/database/repositories";
import { reviewFieldLabel, reviewFieldOptions } from "@sellbridge/shared/supplier-product-review";
import { CheckIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SmartDate } from "@/components/data/smart-date";
import { SectionCard } from "@/components/layout/section-card";
import { CompletenessMeter } from "@/components/supplier-panel/catalog/completeness-meter";
import { ReviewStatus } from "@/components/supplier-panel/catalog/review-status";
import { Button } from "@/components/ui/button";
import { useCatalogAction } from "@/features/admin-suppliers/use-catalog-action";
import {
  addIssueReason,
  addPresetReason,
  checkRejection,
  removeReason,
  updateReason,
  type DraftReason,
} from "@/features/admin-product-review/rejection-draft";
import { reviewQueueKey } from "@/features/admin-product-review/review.queries";
import {
  adminApprovePanelProduct,
  adminRejectPanelProduct,
} from "@/features/supplier-panel/catalog/catalog.functions";
import { RejectionReasonsEditor } from "./rejection-reasons-editor";
import { CONTROL_HINTS } from "@/components/icons/action-icons";
import { Hint } from "@/components/ui/hint";

const NO_ERRORS: ReadonlyMap<string, string> = new Map();

function useReviewActions(onDecided: () => void) {
  const queryClient = useQueryClient();
  async function afterDecision() {
    await queryClient.invalidateQueries({ queryKey: reviewQueueKey });
    onDecided();
  }
  const approve = useCatalogAction(
    adminApprovePanelProduct,
    "Produto aprovado",
    () => void afterDecision(),
  );
  const reject = useCatalogAction(
    adminRejectPanelProduct,
    "Produto reprovado",
    () => void afterDecision(),
  );
  return { approve, reject };
}

/** A product someone already decided: say so instead of offering the buttons again. */
function AlreadyDecided({ product }: { product: ProductAwaitingReview }) {
  return (
    <SectionCard title="Análise">
      <div className="space-y-3 text-sm">
        <ReviewStatus status={product.reviewStatus} />
        <p className="text-muted-foreground">
          {product.reviewedAt === null ? (
            "Não está mais em análise."
          ) : (
            <>
              Decidido <SmartDate date={product.reviewedAt} />.
            </>
          )}
        </p>
        {product.rejectionReasons.length > 0 ? (
          <ul className="space-y-1">
            {product.rejectionReasons.map((reason) => (
              <li key={`${reason.field}-${reason.rule}`}>
                <span className="font-medium">{reviewFieldLabel(reason.field)}:</span>{" "}
                {reason.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </SectionCard>
  );
}

/**
 * A product the marketplace would refuse can still be approved (the reviewer may know better),
 * but never without saying so: approving it silently was the panel's most common surprise.
 */
function ApproveCard({
  busy,
  blocking,
  onApprove,
}: {
  busy: boolean;
  blocking: number;
  onApprove: () => void;
}) {
  return (
    <SectionCard title="Decisão">
      <div className="space-y-3">
        {blocking > 0 ? (
          <p
            role="note"
            className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-footnote text-amber-700 dark:text-amber-400"
          >
            <WarningIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Com {blocking} {blocking === 1 ? "pendência" : "pendências"}, a publicação no Mercado
            Livre vai falhar.
          </p>
        ) : null}
        <Hint label={CONTROL_HINTS.approveProduct} openOnTap={false}>
          <Button className="w-full" disabled={busy} onClick={onApprove}>
            <CheckIcon aria-hidden="true" />
            {blocking > 0 ? "Aprovar mesmo assim" : "Aprovar"}
          </Button>
        </Hint>
        <p className="text-footnote text-muted-foreground">Fica visível para os revendedores.</p>
      </div>
    </SectionCard>
  );
}

/** The meter brings its own heading; the card only adds how to use it here. */
function CompletenessCard({
  product,
  onPick,
}: {
  product: ProductAwaitingReview;
  onPick: (field: string) => void;
}) {
  return (
    <section className="surface-card space-y-3 rounded-3xl bg-card p-5 sm:p-6">
      <CompletenessMeter report={product.completeness} onFix={onPick} />
      <p className="text-footnote text-muted-foreground">
        Cada item pode virar um motivo de reprovação.
      </p>
    </section>
  );
}

interface ReviewDecisionProps {
  product: ProductAwaitingReview;
  onDecided: () => void;
}

/**
 * Approve in one click, or reject with at least one reason tied to a field. Clicking a
 * completeness problem turns it into a reason, so the obvious ones need no typing.
 */
export function ReviewDecision({ product, onDecided }: ReviewDecisionProps) {
  const [reasons, setReasons] = useState<DraftReason[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const { approve, reject } = useReviewActions(onDecided);
  if (product.reviewStatus !== "in_review") {
    return <AlreadyDecided product={product} />;
  }
  const check = checkRejection(reasons);
  const busy = approve.isPending || reject.isPending;
  const ref = { supplierId: product.supplierId, productId: product.id };
  const allIssues = [...product.completeness.blocking, ...product.completeness.improvements];

  function addFromIssue(field: string) {
    const issue = allIssues.find((candidate) => candidate.field === field);
    if (issue === undefined) {
      return;
    }
    setReasons((current) => addIssueReason(current, issue, crypto.randomUUID()));
  }

  function submitRejection() {
    if (!check.valid) {
      setShowErrors(true);
      return;
    }
    reject.mutate({ data: { ...ref, reasons: check.reasons } });
  }

  return (
    <div className="space-y-6">
      <ApproveCard
        busy={busy}
        blocking={product.completeness.blocking.length}
        onApprove={() => approve.mutate({ data: ref })}
      />
      <SectionCard title="Reprovar" description="O fornecedor vê cada motivo no campo indicado.">
        <div className="space-y-4">
          <RejectionReasonsEditor
            reasons={reasons}
            fieldOptions={reviewFieldOptions(
              Object.keys(product.mercadoLivreAttributes),
              reasons.map((reason) => reason.field),
            )}
            errorsByKey={showErrors && !check.valid ? check.byKey : NO_ERRORS}
            formError={showErrors && !check.valid ? check.formError : null}
            onAdd={(rule) =>
              setReasons((current) => addPresetReason(current, rule, crypto.randomUUID()))
            }
            onChange={(key, patch) => setReasons((current) => updateReason(current, key, patch))}
            onRemove={(key) => setReasons((current) => removeReason(current, key))}
          />
          <Hint label={CONTROL_HINTS.rejectProduct} openOnTap={false}>
            <Button variant="outline" className="w-full" disabled={busy} onClick={submitRejection}>
              <XIcon aria-hidden="true" />
              Reprovar com {reasons.length} {reasons.length === 1 ? "motivo" : "motivos"}
            </Button>
          </Hint>
        </div>
      </SectionCard>
      <CompletenessCard product={product} onPick={addFromIssue} />
    </div>
  );
}
