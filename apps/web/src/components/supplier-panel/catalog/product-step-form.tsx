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
  FORM_STEPS,
  stepOfField,
  type FormStepId,
} from "@/features/supplier-panel/catalog/draft-form";
import { isStockFromBling } from "@/features/supplier-panel/catalog/stock-from-bling";
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
import { CategoryQuestion, GridTypeQuestion } from "./grid/grid-type-question";

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
  onCreated?: ((productId: string) => void) | undefined;
  /** Opens the grid form instead; set while grids are on (PRODUCT_GRID_ENABLED). */
  onChooseGrid?: (() => void) | undefined;
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

/** Canonicalize a saved draft only after its latest edits have reached the server. */
function useDraftAddress(form: ProductForm, onCreated: ProductStepFormProps["onCreated"]) {
  const notified = useRef(false);
  useEffect(() => {
    if (
      notified.current ||
      form.saved === null ||
      onCreated === undefined ||
      form.autosave.hasUnsavedChanges()
    )
      return;
    notified.current = true;
    onCreated(form.saved.id);
  }, [form.saved, form.autosave, onCreated]);
}

function StepNavigation({
  step,
  onChange,
}: {
  step: FormStepId;
  onChange: (step: FormStepId) => void;
}) {
  const index = FORM_STEPS.findIndex((item) => item.id === step);
  const previous = FORM_STEPS[index - 1];
  const next = FORM_STEPS[index + 1];
  return (
    <nav
      aria-label="Navegar entre etapas"
      className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:justify-between"
    >
      {previous === undefined ? null : (
        <Button variant="outline" onClick={() => onChange(previous.id)}>
          Voltar: {previous.label}
        </Button>
      )}
      {next === undefined ? null : (
        <Button onClick={() => onChange(next.id)}>Continuar: {next.label}</Button>
      )}
    </nav>
  );
}

/** Nothing typed is still on its way to the server. */
function isSettled(form: ProductForm): boolean {
  return form.saved !== null && ["idle", "saved"].includes(form.autosave.state.kind);
}

/** The kind of product is chosen before anything is saved; afterwards it stays as it is. */
function CategoryStep({
  stepProps,
  categories,
  isNew,
  onChooseGrid,
}: {
  stepProps: Omit<Parameters<typeof StepCategory>[0], "categories">;
  categories: FormData["categories"];
  isNew: boolean;
  onChooseGrid: (() => void) | undefined;
}) {
  if (onChooseGrid === undefined || !isNew) {
    return <StepCategory {...stepProps} categories={categories} />;
  }
  return (
    <div className="grid gap-8">
      <GridTypeQuestion
        hasGrid={false}
        onChange={(hasGrid) => {
          if (hasGrid) onChooseGrid();
        }}
      />
      <div className="grid gap-3">
        <CategoryQuestion />
        <StepCategory {...stepProps} categories={categories} />
      </div>
    </div>
  );
}

function ReviewStep({ form }: { form: ProductForm }) {
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

function StepContent({
  step,
  form,
  categories,
  taxDefaults,
  supplierId,
  onChooseGrid,
  product,
}: {
  step: FormStepId;
  form: ProductForm;
  categories: FormData["categories"];
  taxDefaults: FormData["taxDefaults"];
  supplierId: string;
  onChooseGrid: (() => void) | undefined;
  product: FormData["product"];
}) {
  const [stockFromBling] = useState(() => isStockFromBling(product, new Date()));
  const stepProps = {
    values: form.values,
    errors: form.autosave.state.kind === "invalid" ? form.autosave.state.errors : {},
    reasons: groupReasons(form.reasons, form.edited),
    onChange: form.change,
  };
  switch (step) {
    case "category": {
      return (
        <CategoryStep
          stepProps={stepProps}
          categories={categories}
          isNew={form.saved === null}
          onChooseGrid={onChooseGrid}
        />
      );
    }
    case "details": {
      return (
        <StepDetails
          {...stepProps}
          required={form.required}
          taxDefaults={taxDefaults}
          mercadoLivre={{ supplierId, ficha: form.ficha }}
          stockFromBling={stockFromBling}
        />
      );
    }
    case "images": {
      return <StepImages {...stepProps} supplierId={supplierId} />;
    }
    default: {
      return <ReviewStep form={form} />;
    }
  }
}

const NEW_PRODUCT_HINT =
  "Informe o código do produto (SKU) para começar a salvar sozinho. Depois, você pode sair e continuar o cadastro quando quiser.";
const SAVED_PRODUCT_HINT = "Tudo o que você muda é salvo sozinho.";

function ProductFormHeader({ form, onBack }: { form: ProductForm; onBack: () => void }) {
  return (
    <PageHeader
      back={
        <BackButton
          onBack={() => {
            if (form.canDiscard()) {
              onBack();
            }
          }}
        />
      }
      title={form.values.title.trim() === "" ? "Novo produto" : form.values.title}
      description={form.saved === null ? NEW_PRODUCT_HINT : SAVED_PRODUCT_HINT}
      actions={form.saved === null ? undefined : <ReviewStatus status={form.status} />}
    />
  );
}

function LoadedForm({
  supplierId,
  productId,
  data,
  focusField,
  onBack,
  onCreated,
  onChooseGrid,
}: Omit<ProductStepFormProps, "productId"> & { data: FormData; productId: string }) {
  const form = useProductForm({
    supplierId,
    productId,
    product: data.product,
    categories: data.categories,
    taxDefaults: data.taxDefaults,
    brandNiche: data.brandNiche,
    productGridEnabled: data.productGridEnabled,
  });
  const [step, setStep] = useState<FormStepId>(() =>
    focusField === undefined ? "category" : stepOfField(focusField),
  );
  const focusOn = useFieldFocus(focusField, setStep);
  useDraftAddress(form, onCreated);
  return (
    <div className="space-y-6">
      <ProductFormHeader form={form} onBack={onBack} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="surface-card min-w-0 space-y-6 rounded-3xl bg-card p-5 sm:p-6">
          <FormStepper
            current={step}
            blocking={form.report.blocking}
            onSelect={setStep}
            steps={FORM_STEPS}
            stepOf={stepOfField}
          />
          <StepContent
            step={step}
            form={form}
            categories={data.categories}
            taxDefaults={data.taxDefaults}
            supplierId={supplierId}
            onChooseGrid={data.productGridEnabled ? onChooseGrid : undefined}
            product={data.product}
          />
          <AutosaveIndicator
            state={form.autosave.state}
            onRetry={form.autosave.retry}
            onReload={() => window.location.reload()}
          />
          <StepNavigation step={step} onChange={setStep} />
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
  onCreated,
  onChooseGrid,
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
      onCreated={onCreated}
      onChooseGrid={onChooseGrid}
    />
  );
}
