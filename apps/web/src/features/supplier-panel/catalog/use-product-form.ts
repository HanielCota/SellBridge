import { withFiscalFallback, type FiscalFallback } from "@sellbridge/shared/product-fiscal";
import type { SupplierTaxSetup } from "@sellbridge/shared/supplier-fiscal";
import {
  evaluateCompleteness,
  requiredAttributesFor,
  type RequiredAttribute,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import type { ProductReviewStatus } from "@sellbridge/shared/supplier-panel-catalog-status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { toast } from "sonner";
import { supplierPanelSubmitProduct } from "./catalog.functions";
import { supplierPanelCatalogKey, supplierPanelProductFormQueryOptions } from "./catalog.queries";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  completenessInput,
  editedFields,
  fiscalForCompleteness,
  categoryIdOfNiche,
  initialFormValues,
  type PanelFormValues,
} from "./draft-form";
import { useDraftAutosave, type SavedProduct } from "./use-draft-autosave";
import { withMercadoLivreRequired } from "./mercado-livre-ficha";
import { useMercadoLivreFicha } from "./use-mercado-livre-ficha";
import { usePanelSupplierApproved } from "@/features/supplier-panel/use-panel-supplier";

/** The completeness while the supplier types, NF-e data included (origin and unit from Marca). */
function useLiveCompleteness(
  values: PanelFormValues,
  required: readonly RequiredAttribute[],
  fiscal: { required: boolean; fallback: FiscalFallback | null },
) {
  const { required: fiscalRequired, fallback } = fiscal;
  return useMemo(
    () =>
      evaluateCompleteness(
        {
          ...completenessInput(values),
          fiscal: withFiscalFallback(fiscalForCompleteness(values.fiscal), fallback),
          fiscalRequired,
        },
        required,
      ),
    [values, required, fiscalRequired, fallback],
  );
}

/**
 * The chosen category, its Mercado Livre sheet and the attributes required to publish: ours for
 * the category plus those Mercado Livre requires.
 */
function useCategoryRules(
  supplierId: string,
  values: PanelFormValues,
  setValues: Dispatch<SetStateAction<PanelFormValues>>,
  categories: readonly CategoryOption[],
) {
  const category = categories.find((option) => option.id === values.categoryId);
  const ficha = useMercadoLivreFicha(supplierId, values, setValues);
  const required = useMemo(
    () => withMercadoLivreRequired(requiredAttributesFor(category?.slug), ficha.fields),
    [category?.slug, ficha.fields],
  );
  return { category, ficha, required };
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface ProductFormOptions {
  supplierId: string;
  productId: string;
  product: SavedProduct | null;
  categories: readonly CategoryOption[];
  taxDefaults: SupplierTaxSetup | null;
  brandNiche: string | null;
}

/**
 * What the form opens with. The brand's defaults are not an edit: they reach the product with
 * the supplier's first change.
 */
function openingValues(options: ProductFormOptions): PanelFormValues {
  return initialFormValues(options.product, {
    fiscal: options.taxDefaults?.defaults ?? null,
    categoryId: categoryIdOfNiche(options.categories, options.brandNiche),
  });
}

/**
 * Everything the step form holds: the values being typed, the live completeness, the server
 * autosave and the submission for review.
 */
export function useProductForm(options: ProductFormOptions) {
  const { supplierId, productId, product, categories, taxDefaults, brandNiche } = options;
  const queryClient = useQueryClient();
  const [openedWith] = useState(() => openingValues(options));
  const [values, setValues] = useState<PanelFormValues>(openedWith);
  const edited = useMemo(() => editedFields(openedWith, values), [openedWith, values]);
  const [saved, setSaved] = useState<SavedProduct | null>(product);
  const { category, ficha, required } = useCategoryRules(supplierId, values, setValues, categories);
  // A new product needs NCM, origin and unit to be published; one from before that rule does not.
  const report = useLiveCompleteness(values, required, {
    required: saved?.fiscalRequired ?? true,
    fallback: taxDefaults?.defaults ?? null,
  });
  const autosave = useDraftAutosave({
    supplierId,
    productId,
    values,
    initial: product,
    onSaved: (stored, sentStock) => {
      setSaved(stored);
      queryClient.setQueryData(
        supplierPanelProductFormQueryOptions(supplierId, stored.id).queryKey,
        { product: stored, categories: [...categories], taxDefaults, brandNiche },
      );
      // A sale moved the shelf while the supplier left stock alone: show the real count.
      setValues((current) =>
        current.stock === String(sentStock) && stored.stock !== sentStock
          ? { ...current, stock: String(stored.stock) }
          : current,
      );
      void queryClient.invalidateQueries({
        queryKey: [...supplierPanelCatalogKey(supplierId), "list"],
      });
    },
  });
  const submit = useSubmitProduct(supplierId, productId, setSaved);
  const canDiscard = useUnsavedChanges(autosave.hasUnsavedChanges(values), () =>
    autosave.hasUnsavedChanges(values),
  );
  const status: ProductReviewStatus = saved?.reviewStatus ?? "draft";
  const showsReasons = status === "rejected" || status === "draft";
  return {
    values,
    change: (change: Partial<PanelFormValues>) =>
      setValues((current) => ({ ...current, ...change })),
    saved,
    status,
    category,
    required,
    ficha,
    report,
    reasons: showsReasons ? (saved?.rejectionReasons ?? []) : [],
    edited,
    autosave,
    submit,
    canDiscard,
  };
}

function useSubmitProduct(
  supplierId: string,
  productId: string,
  onSaved: (product: SavedProduct) => void,
) {
  const queryClient = useQueryClient();
  const supplierApproved = usePanelSupplierApproved();
  return useMutation({
    mutationFn: async () => await supplierPanelSubmitProduct({ data: { supplierId, productId } }),
    onSuccess: async (submitted) => {
      onSaved(submitted);
      toast.success(
        supplierApproved
          ? "Produto publicado: já aparece para os revendedores"
          : "Produto publicado: aparece para os revendedores assim que sua marca for aprovada",
      );
      await queryClient.invalidateQueries({ queryKey: supplierPanelCatalogKey(supplierId) });
    },
  });
}
