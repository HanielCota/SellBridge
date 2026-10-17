import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supplierPanelProductFormQueryOptions } from "@/features/supplier-panel/catalog/catalog.queries";
import {
  inputIdOf,
  stepOfField,
  type FormStepId,
} from "@/features/supplier-panel/catalog/draft-form";
import { useProductForm } from "@/features/supplier-panel/catalog/use-product-form";
import { errorMessage } from "@/lib/errors";
import { prefersReducedMotion } from "@/lib/rewind";
import { AutosaveIndicator } from "./autosave-indicator";
import { CompletenessMeter } from "./completeness-meter";
import { groupReasons } from "./field-reason";
import { FormStepper } from "./form-stepper";
import { ReviewStatus } from "./review-status";
import { StepCategory } from "./step-category";
import { StepDetails } from "./step-details";
import { StepImages } from "./step-images";
import { StepReview } from "./step-review";

type FormData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof supplierPanelProductFormQueryOptions>["queryFn"]>>
>;

interface ProductStepFormProps {
  supplierId: string;
  /** Absent for a new product; the form then makes up its id for idempotent autosave. */
  productId?: string | undefined;
  /** A field to open on, as "Corrigir" asks (e.g. `imageUrls`, `attributes.BRAND`). */
  focusField?: string | undefined;
  onBack: () => void;
}

/**
 * Opens the field's step, then moves focus to it once it is on screen. The target lives in a
 * ref and is consumed after the next commit, so no state is set from inside the effect.
 */
function useFieldFocus(initialField: string | undefined, setStep: (step: FormStepId) => void) {
  const pending = useRef(initialField);
  useEffect(() => {
    if (pending.current === undefined) {
      return;
    }
    const element = document.getElementById(inputIdOf(pending.current));
    if (element === null) {
      return;
    }
    pending.current = undefined;
    element.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    element.focus({ preventScroll: true });
  });
  return (field: string) => {
    pending.current = field;
    setStep(stepOfField(field));
  };
}

/** Same look as `BackLink`, for a panel whose routes are wired by the access work. */
function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3 w-fit print:hidden" onClick={onBack}>
      <ArrowLeftIcon aria-hidden="true" />
      Produtos
    </Button>
  );
}

type ProductForm = ReturnType<typeof useProductForm>;

/** Nothing typed is still on its way to the server. */
function isSettled(form: ProductForm): boolean {
  return form.saved !== null && ["idle", "saved"].includes(form.autosave.state.kind);
}

function StepContent({
  step,
  form,
  categories,
  supplierId,
}: {
  step: FormStepId;
  form: ProductForm;
  categories: FormData["categories"];
  supplierId: string;
}) {
  const stepProps = {
    values: form.values,
    errors: form.autosave.state.kind === "invalid" ? form.autosave.state.errors : {},
    reasons: groupReasons(form.reasons, form.edited),
    onChange: form.change,
  };
  switch (step) {
    case "category": {
      return <StepCategory {...stepProps} categories={categories} />;
    }
    case "details": {
      return <StepDetails {...stepProps} required={form.required} />;
    }
    case "images": {
      return <StepImages {...stepProps} supplierId={supplierId} />;
    }
    default: {
      return (
        <StepReview
          values={form.values}
          categoryName={form.category?.name ?? null}
          status={form.status}
          report={form.report}
          canSubmitNow={isSettled(form)}
          isSubmitting={form.submit.isPending}
          submitError={form.submit.isError ? errorMessage(form.submit.error) : null}
          onSubmit={() => form.submit.mutate()}
        />
      );
    }
  }
}

function LoadedForm({
  supplierId,
  productId,
  data,
  focusField,
  onBack,
}: Omit<ProductStepFormProps, "productId"> & { data: FormData; productId: string }) {
  const form = useProductForm({
    supplierId,
    productId,
    product: data.product,
    categories: data.categories,
  });
  const [step, setStep] = useState<FormStepId>(() =>
    focusField === undefined ? "category" : stepOfField(focusField),
  );
  const focusOn = useFieldFocus(focusField, setStep);
  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackButton onBack={onBack} />}
        title={form.values.title.trim() === "" ? "Novo produto" : form.values.title}
        actions={form.saved === null ? undefined : <ReviewStatus status={form.status} />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="surface-card min-w-0 space-y-6 rounded-3xl bg-card p-5 sm:p-6">
          <FormStepper current={step} blocking={form.report.blocking} onSelect={setStep} />
          <StepContent
            step={step}
            form={form}
            categories={data.categories}
            supplierId={supplierId}
          />
          <AutosaveIndicator
            state={form.autosave.state}
            onRetry={form.autosave.retry}
            onReload={() => window.location.reload()}
          />
        </section>
        <aside className="surface-card rounded-3xl bg-card p-5 lg:sticky lg:top-24">
          <CompletenessMeter report={form.report} onFix={focusOn} />
        </aside>
      </div>
    </div>
  );
}

export function ProductStepForm({
  supplierId,
  productId,
  focusField,
  onBack,
}: ProductStepFormProps) {
  const [draftId] = useState(() => productId ?? crypto.randomUUID());
  const query = useQuery(supplierPanelProductFormQueryOptions(supplierId, productId));
  if (query.isPending) {
    return <Skeleton className="h-[32rem] rounded-3xl" aria-label="Carregando produto" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return (
    <LoadedForm
      supplierId={supplierId}
      productId={draftId}
      data={query.data}
      focusField={focusField}
      onBack={onBack}
    />
  );
}
