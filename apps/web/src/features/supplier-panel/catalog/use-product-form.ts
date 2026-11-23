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
  fiscal: { required: boolean; weightRequired: boolean; fallback: FiscalFallback | null },
) {
  const { required: fiscalRequired, weightRequired, fallback } = fiscal;
  return useMemo(
    () =>
      evaluateCompleteness(
        {
          ...completenessInput(values),
          fiscal: withFiscalFallback(fiscalForCompleteness(values.fiscal), fallback),
          fiscalRequired,
          weightRequired,
        },
        required,
      ),
    [values, required, fiscalRequired, weightRequired, fallback],
  );
}

/**
 * The chosen category, its Mercado Livre sheet and the attributes required to publish: ours for
 * the category plus those Mercado Livre requires.
 */
function useCategoryRules(
  options: Pick<ProductFormOptions, "supplierId" | "categories">,
  values: PanelFormValues,
  setValues: Dispatch<SetStateAction<PanelFormValues>>,
  autoPick: boolean,
) {
  const category = options.categories.find((option) => option.id === values.categoryId);
  const ficha = useMercadoLivreFicha(options.supplierId, values, setValues, { autoPick });
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
  /** Whether a new product may be a colour and size grid (PRODUCT_GRID_ENABLED). */
  productGridEnabled: boolean;
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

/** What the form query holds once a product is saved, so reopening it needs no request. */
function formDataOf(options: ProductFormOptions, stored: SavedProduct) {
  return {
    product: stored,
    categories: [...options.categories],
    taxDefaults: options.taxDefaults,
    brandNiche: options.brandNiche,
    productGridEnabled: options.productGridEnabled,
  };
}

/**
 * Everything the step form holds: the values being typed, the live completeness, the server
 * autosave and the submission for review.
 */
export function useProductForm(options: ProductFormOptions) {
  const { supplierId, productId, product, taxDefaults } = options;
  const queryClient = useQueryClient();
  const [openedWith] = useState(() => openingValues(options));
  const [values, setValues] = useState<PanelFormValues>(openedWith);
  const edited = useMemo(() => editedFields(openedWith, values), [openedWith, values]);
  const [saved, setSaved] = useState<SavedProduct | null>(product);
  // Opening a saved product must not change it, so only a product new to this form gets the
  // Mercado Livre guess filled in. Decided once: the first autosave must not switch it off.
  const [openedNew] = useState(product === null);
  const { category, ficha, required } = useCategoryRules(options, values, setValues, openedNew);
  // A new product needs NCM, origin, unit and a weight to be published; one from before those
  // rules does not.
  const report = useLiveCompleteness(values, required, {
    required: saved?.fiscalRequired ?? true,
    weightRequired: saved?.weightRequired ?? true,
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
        formDataOf(options, stored),
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
