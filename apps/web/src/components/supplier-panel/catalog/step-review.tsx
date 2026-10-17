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

const STATUS_NOTES: Readonly<Record<ProductReviewStatus, string>> = {
  draft:
    "Quando estiver pronto, envie para a análise. Você recebe a resposta aqui, com o motivo em cada campo se algo precisar mudar.",
  in_review:
    "Em análise pela equipe. Você pode continuar editando: as mudanças entram na mesma análise.",
  approved:
    "Aprovado e visível para os revendedores. Mudar título, imagens ou categoria envia o produto para uma nova análise; estoque e custo, não.",
  rejected:
    "Reprovado. Corrija os campos marcados: ao editar, o produto volta a rascunho e pode ser reenviado.",
};

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
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
        <SummaryRow label="Categoria">{categoryName ?? "—"}</SummaryRow>
        <SummaryRow label="Título">{values.title || "—"}</SummaryRow>
        <SummaryRow label="SKU">{values.sku || "—"}</SummaryRow>
        <SummaryRow label="Custo">{cost === null ? "—" : <Money cents={cost} />}</SummaryRow>
        <SummaryRow label="Estoque">{values.stock || "—"}</SummaryRow>
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
