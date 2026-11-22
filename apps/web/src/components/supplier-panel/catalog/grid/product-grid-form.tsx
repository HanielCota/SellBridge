import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/feedback/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GRID_FORM_STEPS,
  gridStepOfField,
  type GridFormStepId,
} from "@/features/supplier-panel/catalog/grid/grid-form-steps";
import { supplierPanelModelFormQueryOptions } from "@/features/supplier-panel/catalog/grid/grid.queries";
import { useGridForm } from "@/features/supplier-panel/catalog/grid/use-grid-form";
import { errorMessage } from "@/lib/errors";
import { AutosaveIndicator } from "../autosave-indicator";
import { CompletenessMeter } from "../completeness-meter";
import { FormStepper } from "../form-stepper";
import type { ReasonsByField } from "../field-reason";
import { ReviewStatus } from "../review-status";
import { StepCategory } from "../step-category";
import { StepDetails } from "../step-details";
import { GridOptionsStep } from "./grid-options-step";
import { GridPhotosStep } from "./grid-photos-step";
import { GridReviewStep } from "./grid-review-step";
import { SeparateGridCard } from "../grouping/separate-grid-card";
import { CategoryQuestion, GridTypeQuestion } from "./grid-type-question";

type GridForm = ReturnType<typeof useGridForm>;
type FormData = Extract<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof supplierPanelModelFormQueryOptions>["queryFn"]>>
  >,
  { available: true }
>;

interface ProductGridFormProps {
  supplierId: string;
  /** Absent for a new grid; the form then makes up its id for idempotent autosave. */
  modelId?: string | undefined;
  onBack: () => void;
  onCreated?: ((modelId: string) => void) | undefined;
  /** Back to the single product form, while nothing of the grid is saved yet. */
  onChooseSingle: () => void;
}

const NEW_GRID_HINT =
  "Informe o nome do produto para começar a salvar sozinho. Depois, você pode sair e continuar quando quiser.";
const SAVED_GRID_HINT = "Tudo o que você muda é salvo sozinho.";

/** Nothing typed is still on its way to the server. */
function isSettled(form: GridForm): boolean {
  return form.saved !== null && ["idle", "saved"].includes(form.autosave.state.kind);
}

/** Grids carry no team rejection reasons: publishing approves them at once. */
const NO_REASONS: ReasonsByField = new Map();

/** The kind of product can still change back while nothing of the grid is saved. */
function GridCategoryStep({
  form,
  categories,
  onChooseSingle,
}: {
  form: GridForm;
  categories: FormData["categories"];
  onChooseSingle: () => void;
}) {
  return (
    <div className="grid gap-8">
      {form.saved === null ? (
        <GridTypeQuestion
          hasGrid
          onChange={(hasGrid) => {
            if (!hasGrid) onChooseSingle();
          }}
        />
      ) : null}
      <div className="grid gap-3">
        {form.saved === null ? <CategoryQuestion /> : null}
        <StepCategory
          values={form.values}
          reasons={NO_REASONS}
          onChange={form.changeValues}
          categories={categories}
        />
      </div>
    </div>
  );
}

function PhotosStep({
  form,
  errors,
  supplierId,
}: {
  form: GridForm;
  errors: Readonly<Record<string, string>>;
  supplierId: string;
}) {
  return (
    <GridPhotosStep
      supplierId={supplierId}
      values={form.values}
      errors={errors}
      grid={form.grid}
      onChange={form.changeValues}
      changeGrid={form.changeGrid}
    />
  );
}

function StepContent({
  step,
  form,
  data,
  supplierId,
  onChooseSingle,
}: {
  step: GridFormStepId;
  form: GridForm;
  data: FormData;
  supplierId: string;
  onChooseSingle: () => void;
}) {
  const errors = form.autosave.state.kind === "invalid" ? form.autosave.state.errors : {};
  const stepProps = {
    values: form.values,
    errors,
    reasons: NO_REASONS,
    onChange: form.changeValues,
  };
  switch (step) {
    case "category": {
      return (
        <GridCategoryStep
          form={form}
          categories={data.categories}
          onChooseSingle={onChooseSingle}
        />
      );
    }
    case "details": {
      return (
        <StepDetails
          {...stepProps}
          variant="model"
          required={form.required}
          taxDefaults={data.taxDefaults}
          mercadoLivre={{ supplierId, ficha: form.ficha }}
        />
      );
    }
    case "options": {
      return <GridOptionsStep grid={form.grid} errors={errors} changeGrid={form.changeGrid} />;
    }
    case "images": {
      return <PhotosStep form={form} errors={errors} supplierId={supplierId} />;
    }
    default: {
      return <ReviewStep form={form} />;
    }
  }
}

function ReviewStep({ form }: { form: GridForm }) {
  return (
    <GridReviewStep
      values={form.values}
      grid={form.grid}
      modelCode={form.saved?.code ?? null}
      categoryName={form.category?.name ?? null}
      status={form.status}
      hasDraftCombination={
        form.saved === null ||
        form.saved.combinations.some(
          (combination) => combination.active && combination.reviewStatus !== "approved",
        )
      }
      report={form.report}
      canSubmitNow={isSettled(form)}
      isSubmitting={form.publish.isPending}
      submitError={form.publish.isError ? errorMessage(form.publish.error) : null}
      onSubmit={() => form.publish.mutate()}
    />
  );
}

function StepNavigation({
  step,
  onChange,
}: {
  step: GridFormStepId;
  onChange: (step: GridFormStepId) => void;
}) {
  const index = GRID_FORM_STEPS.findIndex((item) => item.id === step);
  const previous = GRID_FORM_STEPS[index - 1];
  const next = GRID_FORM_STEPS[index + 1];
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

/** Replaces "novo" in the address with the saved grid's id once its edits reached the server. */
function useSavedAddress(form: GridForm, onCreated: ProductGridFormProps["onCreated"]) {
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

function GridFormHeader({ form, onBack }: { form: GridForm; onBack: () => void }) {
  return (
    <PageHeader
      back={
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 w-fit print:hidden"
          onClick={() => {
            if (form.canDiscard()) onBack();
          }}
        >
          <ArrowLeftIcon aria-hidden="true" />
          Produtos
        </Button>
      }
      title={
        form.values.title.trim() === "" ? "Novo produto com cores e tamanhos" : form.values.title
      }
      description={form.saved === null ? NEW_GRID_HINT : SAVED_GRID_HINT}
      actions={form.saved === null ? undefined : <ReviewStatus status={form.status} />}
    />
  );
}

/** A grid made by grouping products can be separated again, from its own form. */
function GroupedGridSection({
  supplierId,
  modelId,
  data,
  onBack,
}: {
  supplierId: string;
  modelId: string;
  data: FormData;
  onBack: () => void;
}) {
  if (data.groupedAt === null || data.model === null) {
    return null;
  }
  return (
    <SeparateGridCard
      supplierId={supplierId}
      modelId={modelId}
      groupedAt={data.groupedAt}
      products={data.model.combinations.length}
      onSeparated={onBack}
    />
  );
}

function LoadedForm({
  supplierId,
  modelId,
  data,
  onBack,
  onCreated,
  onChooseSingle,
}: Omit<ProductGridFormProps, "modelId"> & { modelId: string; data: FormData }) {
  const form = useGridForm({
    supplierId,
    modelId,
    model: data.model,
    categories: data.categories,
    taxDefaults: data.taxDefaults,
    brandNiche: data.brandNiche,
  });
  const [step, setStep] = useState<GridFormStepId>("category");
  useSavedAddress(form, onCreated);
  return (
    <div className="space-y-6">
      <GridFormHeader form={form} onBack={onBack} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="surface-card min-w-0 space-y-6 rounded-3xl bg-card p-5 sm:p-6">
          <FormStepper
            current={step}
            blocking={form.report.blocking}
            onSelect={setStep}
            steps={GRID_FORM_STEPS}
            stepOf={gridStepOfField}
          />
          <StepContent
            step={step}
            form={form}
            data={data}
            supplierId={supplierId}
            onChooseSingle={onChooseSingle}
          />
          <AutosaveIndicator
            state={form.autosave.state}
            onRetry={form.autosave.retry}
            onReload={() => window.location.reload()}
          />
          <StepNavigation step={step} onChange={setStep} />
        </section>
        <aside className="surface-card rounded-3xl bg-card p-5 lg:sticky lg:top-24">
          <CompletenessMeter
            report={form.report}
            onFix={(field) => setStep(gridStepOfField(field))}
          />
        </aside>
      </div>
      <GroupedGridSection supplierId={supplierId} modelId={modelId} data={data} onBack={onBack} />
    </div>
  );
}

/** Grids switched off: a link or an old tab lands here, and the way back is the list. */
function GridsUnavailable({ onBack }: { onBack: () => void }) {
  return (
    <section className="surface-card grid max-w-xl gap-3 rounded-3xl bg-card p-5 sm:p-6">
      <h1 className="text-title3 font-semibold">
        Produtos com cores e tamanhos ainda não estão disponíveis
      </h1>
      <p className="text-sm text-muted-foreground">
        Enquanto isso, cadastre cada cor e tamanho como um produto simples.
      </p>
      <Button className="min-h-11 justify-self-start" onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" />
        Voltar para os produtos
      </Button>
    </section>
  );
}

/**
 * The supplier's form for a product sold in colours and sizes: one model, saved as one product
 * per combination, published all at once.
 */
export function ProductGridForm(props: ProductGridFormProps) {
  const [draftId] = useState(() => props.modelId ?? crypto.randomUUID());
  const query = useQuery(supplierPanelModelFormQueryOptions(props.supplierId, props.modelId));
  if (query.isPending) {
    return <Skeleton className="h-[32rem] rounded-3xl" aria-label="Carregando produto" />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.available) {
    return <LoadedForm {...props} modelId={draftId} data={query.data} />;
  }
  return <GridsUnavailable onBack={props.onBack} />;
}
