import type { CompletenessReport } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import type { ProductReviewStatus } from "@sellbridge/shared/supplier-panel-catalog-status";
import { parseCsvMoney } from "@sellbridge/shared/product-csv";
import { CircleNotchIcon, PaperPlaneTiltIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Money } from "@/components/data/money";
import { FormErrorAlert } from "@/components/form/form-feedback";
import { Button } from "@/components/ui/button";
import type { PanelFormValues } from "@/features/supplier-panel/catalog/draft-form";
import { ReviewStatus } from "./review-status";
import { CONTROL_HINTS, TERM_HINTS } from "@/components/icons/action-icons";
import { DisabledHint, HintedText } from "@/components/ui/hint";

const STATUS_NOTES: Readonly<Record<ProductReviewStatus, string>> = {
  draft: "Envie para análise quando estiver pronto.",
  in_review: "As edições feitas agora entram nesta análise.",
  approved: "Mudar título, imagens ou categoria pede nova análise.",
  rejected: "Corrija os campos marcados e envie de novo.",
};

function SummaryRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

interface SubmitProps {
  blockingCount: number;
  /** False while a change is still on its way to the server. */
  canSubmitNow: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
}

function SubmitForReview({
  blockingCount,
  canSubmitNow,
  isSubmitting,
  submitError,
  onSubmit,
}: SubmitProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="grid gap-3"
    >
      <FormErrorAlert message={submitError} />
      {blockingCount > 0 ? (
        <p className="text-sm text-destructive">
          Corrija os itens em “Impede publicar” para enviar.
        </p>
      ) : null}
      <DisabledHint
        reason={blockingCount > 0 ? CONTROL_HINTS.submitBlocked : undefined}
        className="justify-self-start"
      >
        <Button
          type="submit"
          className="justify-self-start"
          disabled={isSubmitting || blockingCount > 0 || !canSubmitNow}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            <CircleNotchIcon className="animate-spin" aria-hidden="true" />
          ) : (
            <PaperPlaneTiltIcon aria-hidden="true" />
          )}
          {isSubmitting ? "Enviando…" : "Enviar para análise"}
        </Button>
      </DisabledHint>
    </form>
  );
}

export function StepReview({
  values,
  categoryName,
  status,
  report,
  ...submit
}: Omit<SubmitProps, "blockingCount"> & {
  values: PanelFormValues;
  categoryName: string | null;
  status: ProductReviewStatus;
  report: CompletenessReport;
}) {
  const cost = parseCsvMoney(values.cost);
  return (
    <div className="grid gap-6">
      <dl className="divide-y divide-border">
        <SummaryRow label="Categoria">{categoryName ?? "Não informado"}</SummaryRow>
        <SummaryRow label="Título">{values.title || "Não informado"}</SummaryRow>
        <SummaryRow
          label={
            <HintedText
              label={TERM_HINTS.productCode}
              className="underline decoration-dotted underline-offset-4"
            >
              Código
            </HintedText>
          }
        >
          {values.sku || "Não informado"}
        </SummaryRow>
        <SummaryRow label="Custo">
          {cost === null ? "Não informado" : <Money cents={cost} />}
        </SummaryRow>
        <SummaryRow label="Estoque">{values.stock || "Não informado"}</SummaryRow>
        <SummaryRow label="Imagens">{values.imageUrls.length}</SummaryRow>
      </dl>
      <div className="space-y-2 rounded-2xl bg-muted/60 p-4">
        <ReviewStatus status={status} />
        <p className="text-sm text-muted-foreground">{STATUS_NOTES[status]}</p>
      </div>
      {status === "draft" ? (
        <SubmitForReview {...submit} blockingCount={report.blocking.length} />
      ) : null}
    </div>
  );
}
