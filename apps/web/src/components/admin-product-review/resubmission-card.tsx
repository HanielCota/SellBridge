import type { ProductAwaitingReview } from "@sellbridge/database/repositories";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { SmartDate } from "@/components/data/smart-date";
import { ToneStatus } from "@/components/data/tone-status";
import { SectionCard } from "@/components/layout/section-card";
import {
  resubmissionChecks,
  type ResubmissionCheck,
} from "@/features/admin-product-review/resubmission";

function CheckRow({ check }: { check: ResubmissionCheck }) {
  return (
    <li className="space-y-1.5 rounded-2xl bg-muted/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-footnote font-semibold">{check.title}</p>
        {check.stillFlagged ? <ToneStatus tone="warning" label="Ainda pendente" /> : null}
      </div>
      <p className="text-sm text-muted-foreground">{check.message}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">{check.fieldLabel} agora: </span>
        {check.currentValue === null ? (
          <span className="text-muted-foreground italic">vazio</span>
        ) : (
          <span className="font-medium break-words">{check.currentValue}</span>
        )}
      </p>
    </li>
  );
}

/**
 * A product the supplier sent again after a rejection: the reviewer starts from what was
 * asked last time and sees each field as it is now, instead of reviewing from scratch.
 */
export function ResubmissionCard({ product }: { product: ProductAwaitingReview }) {
  const checks = resubmissionChecks(product);
  if (checks.length === 0) {
    return null;
  }
  return (
    <SectionCard
      title="Reenvio"
      description="Confira se cada motivo da última reprovação foi corrigido."
    >
      {product.reviewedAt === null ? null : (
        <p className="mb-3 flex items-center gap-1.5 text-footnote text-muted-foreground">
          <ArrowCounterClockwiseIcon className="size-4" aria-hidden="true" />
          Reprovado <SmartDate date={product.reviewedAt} />
        </p>
      )}
      <ul className="space-y-3" aria-label="Motivos da última reprovação">
        {checks.map((check) => (
          <CheckRow key={check.key} check={check} />
        ))}
      </ul>
    </SectionCard>
  );
}
