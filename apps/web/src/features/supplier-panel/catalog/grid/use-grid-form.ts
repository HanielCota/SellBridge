import type { FiscalFallback } from "@sellbridge/shared/product-fiscal";
import { GRID_AXIS_ATTRIBUTES, type ProductModelShared } from "@sellbridge/shared/product-grid";
import type { SupplierTaxSetup } from "@sellbridge/shared/supplier-fiscal";
import { requiredAttributesFor } from "@sellbridge/shared/supplier-panel-catalog-completeness";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { errorMessage } from "@/lib/errors";
import { usePanelSupplierApproved } from "@/features/supplier-panel/use-panel-supplier";
import { supplierPanelCatalogKey } from "../catalog.queries";
import type { AutosaveState } from "../draft-autosaver";
import {
  categoryIdOfNiche,
  initialFormValues,
  panelFormValues,
  type PanelFormValues,
} from "../draft-form";
import { withMercadoLivreRequired } from "../mercado-livre-ficha";
import type { CategoryOption } from "../use-product-form";
import { useMercadoLivreFicha } from "../use-mercado-livre-ficha";
import { AUTOSAVE_DELAY_MILLISECONDS } from "../draft-autosaver";
import { gridCompleteness } from "./grid-form-draft";
import {
  EMPTY_GRID_FORM_STATE,
  gridFormStateOf,
  withSaveAnswer,
  type GridFormState,
} from "./grid-form-state";
import {
  supplierPanelGetModelForm,
  supplierPanelPublishModel,
  supplierPanelSaveModelDraft,
} from "./grid.functions";
import { supplierPanelModelFormQueryOptions } from "./grid.queries";
import { ModelAutosaver, type ModelFormSnapshot, type SentModel } from "./model-autosaver";

type ModelFormData = Awaited<ReturnType<typeof supplierPanelGetModelForm>>;
export type SavedModel = NonNullable<ModelFormData["model"]>;

/**
 * The model's shared values in the fields of the product form, which the grid form reuses. Code,
 * prices and stock are asked per combination, so they stay blank here and are never sent.
 */
function modelFormValues(values: ProductModelShared): PanelFormValues {
  return {
    ...panelFormValues({ ...values, sku: "", costCents: 0, suggestedPriceCents: 0, stock: 0 }),
    sku: "",
    cost: "",
    suggestedPrice: "",
    stock: "",
  };
}

interface GridFormOptions {
  supplierId: string;
  modelId: string;
  model: SavedModel | null;
  categories: readonly CategoryOption[];
  taxDefaults: SupplierTaxSetup | null;
  brandNiche: string | null;
}

function openingSnapshot(options: GridFormOptions): ModelFormSnapshot {
  if (options.model !== null) {
    return { values: modelFormValues(options.model.values), grid: gridFormStateOf(options.model) };
  }
  return {
    values: initialFormValues(null, {
      fiscal: options.taxDefaults?.defaults ?? null,
      categoryId: categoryIdOfNiche(options.categories, options.brandNiche),
    }),
    grid: EMPTY_GRID_FORM_STATE,
  };
}

/** The grid form's server autosave (see `ModelAutosaver`). */
function useModelAutosave(
  options: GridFormOptions,
  snapshot: ModelFormSnapshot,
  onSaved: (model: SavedModel, sent: SentModel) => void,
) {
  const [state, setState] = useState<AutosaveState>({ kind: "idle" });
  const [autosaver] = useState(
    () =>
      new ModelAutosaver<SavedModel>({
        base: { supplierId: options.supplierId, modelId: options.modelId },
        initial: snapshot,
        initialVersion: options.model?.updatedAt ?? null,
        save: async (input) => await supplierPanelSaveModelDraft({ data: input }),
        onState: setState,
        describeError: errorMessage,
      }),
  );
  useEffect(() => {
    autosaver.setOnSaved(onSaved);
  }, [autosaver, onSaved]);
  useEffect(() => {
    autosaver.update(snapshot);
    const timer = window.setTimeout(() => void autosaver.flush(), AUTOSAVE_DELAY_MILLISECONDS);
    return () => window.clearTimeout(timer);
  }, [autosaver, snapshot]);
  return {
    state,
    retry: () => void autosaver.flush(),
    hasUnsavedChanges: (current = snapshot) => autosaver.hasUnsavedChanges(current),
  };
}

function usePublishModel(
  supplierId: string,
  modelId: string,
  onPublished: (model: SavedModel) => void,
) {
  const queryClient = useQueryClient();
  const supplierApproved = usePanelSupplierApproved();
  return useMutation({
    mutationFn: async () => await supplierPanelPublishModel({ data: { supplierId, modelId } }),
    onSuccess: async (model) => {
      onPublished(model);
      toast.success(
        supplierApproved
          ? `Produto publicado com ${model.combinations.length} combinações`
          : "Produto publicado: aparece para os revendedores assim que sua marca for aprovada",
      );
      await queryClient.invalidateQueries({ queryKey: supplierPanelCatalogKey(supplierId) });
    },
  });
}

/** On sale once any combination is; a draft while none is. */
function statusOf(model: SavedModel | null): "approved" | "draft" {
  return model?.combinations.some((combination) => combination.reviewStatus === "approved") === true
    ? "approved"
    : "draft";
}

/**
 * The chosen category, its Mercado Livre sheet and the attributes it requires, and the live
 * score of the whole grid.
 */
function useGridRules(
  options: GridFormOptions,
  snapshot: ModelFormSnapshot,
  setValues: (update: SetStateAction<PanelFormValues>) => void,
) {
  const category = options.categories.find((option) => option.id === snapshot.values.categoryId);
  const sheet = useMercadoLivreFicha(options.supplierId, snapshot.values, setValues);
  // Colour and size come from each combination, so the model's sheet leaves them out.
  const fields = useMemo(
    () => sheet.fields?.filter((field) => !GRID_AXIS_ATTRIBUTES.has(field.id)) ?? null,
    [sheet.fields],
  );
  const ficha = { ...sheet, fields };
  const required = useMemo(
    () => withMercadoLivreRequired(requiredAttributesFor(category?.slug), fields),
    [category?.slug, fields],
  );
  const fallback: FiscalFallback | null = options.taxDefaults?.defaults ?? null;
  const report = useMemo(
    () => gridCompleteness(snapshot.values, snapshot.grid, { required, fallback }),
    [snapshot, required, fallback],
  );
  return { category, ficha, required, report };
}

/**
 * Everything the grid form holds: the shared values and the grid being typed, the live
 * completeness, the server autosave and the publication.
 */
export function useGridForm(options: GridFormOptions) {
  const { supplierId, modelId, categories, taxDefaults, brandNiche } = options;
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<ModelFormSnapshot>(() => openingSnapshot(options));
  const [saved, setSaved] = useState<SavedModel | null>(options.model);
  const setValues = useCallback((update: SetStateAction<PanelFormValues>) => {
    setSnapshot((current) => ({
      ...current,
      values: typeof update === "function" ? update(current.values) : update,
    }));
  }, []);
  const { category, ficha, required, report } = useGridRules(options, snapshot, setValues);
  const onSaved = useCallback(
    (model: SavedModel, sent: SentModel) => {
      setSaved(model);
      setSnapshot((current) => ({
        ...current,
        grid: withSaveAnswer(
          current.grid,
          { grid: sent.snapshot.grid, combinations: sent.combinations },
          model.combinations,
        ),
      }));
      queryClient.setQueryData(supplierPanelModelFormQueryOptions(supplierId, model.id).queryKey, {
        model,
        categories: [...categories],
        taxDefaults,
        brandNiche,
      });
      void queryClient.invalidateQueries({
        queryKey: [...supplierPanelCatalogKey(supplierId), "list"],
      });
    },
    [queryClient, supplierId, categories, taxDefaults, brandNiche],
  );
  const autosave = useModelAutosave(options, snapshot, onSaved);
  const publish = usePublishModel(supplierId, modelId, setSaved);
  const canDiscard = useUnsavedChanges(autosave.hasUnsavedChanges(snapshot), () =>
    autosave.hasUnsavedChanges(snapshot),
  );
  return {
    values: snapshot.values,
    grid: snapshot.grid,
    changeValues: (change: Partial<PanelFormValues>) =>
      setValues((current) => ({ ...current, ...change })),
    changeGrid: (update: (grid: GridFormState) => GridFormState) =>
      setSnapshot((current) => ({ ...current, grid: update(current.grid) })),
    saved,
    status: statusOf(saved),
    category,
    required,
    ficha,
    report,
    autosave,
    publish,
    canDiscard,
  };
}
