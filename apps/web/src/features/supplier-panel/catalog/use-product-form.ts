import type { SupplierTaxSetup } from "@sellbridge/shared/supplier-fiscal";
import {
  evaluateCompleteness,
  requiredAttributesFor,
  type RequiredAttribute,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import type { ProductReviewStatus } from "@sellbridge/shared/supplier-panel-catalog-status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supplierPanelSubmitProduct } from "./catalog.functions";
import { supplierPanelCatalogKey, supplierPanelProductFormQueryOptions } from "./catalog.queries";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import {
  completenessInput,
  editedFields,
  fiscalForCompleteness,
  initialFormValues,
  type PanelFormValues,
} from "./draft-form";
import { useDraftAutosave, type SavedProduct } from "./use-draft-autosave";

/** The completeness while the supplier types, NF-e data included. */
function useLiveCompleteness(
  values: PanelFormValues,
  required: readonly RequiredAttribute[],
  fiscalRequired: boolean,
) {
  return useMemo(
    () =>
      evaluateCompleteness(
        {
          ...completenessInput(values),
          fiscal: fiscalForCompleteness(values.fiscal),
          fiscalRequired,
        },
        required,
      ),
    [values, required, fiscalRequired],
  );
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
}

/**
 * Everything the step form holds: the values being typed, the live completeness, the server
 * autosave and the submission for review.
 */
export function useProductForm(options: ProductFormOptions) {
  const { supplierId, productId, product, categories, taxDefaults } = options;
  const queryClient = useQueryClient();
  // The defaults are not an edit: they reach the product with the supplier's first change.
  const [openedWith] = useState(() => initialFormValues(product, taxDefaults?.defaults ?? null));
  const [values, setValues] = useState<PanelFormValues>(openedWith);
  const edited = useMemo(() => editedFields(openedWith, values), [openedWith, values]);
  const [saved, setSaved] = useState<SavedProduct | null>(product);
  const category = categories.find((option) => option.id === values.categoryId);
  const required = useMemo(() => requiredAttributesFor(category?.slug), [category?.slug]);
  // A new product needs NCM, origin and unit to be published; one from before that rule does not.
  const report = useLiveCompleteness(values, required, saved?.fiscalRequired ?? true);
  const autosave = useDraftAutosave({
    supplierId,
    productId,
    values,
    initial: product,
    onSaved: (stored, sentStock) => {
      setSaved(stored);
      queryClient.setQueryData(
        supplierPanelProductFormQueryOptions(supplierId, stored.id).queryKey,
        {
          product: stored,
          categories: [...categories],
          taxDefaults,
        },
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
  return useMutation({
    mutationFn: async () => await supplierPanelSubmitProduct({ data: { supplierId, productId } }),
    onSuccess: async (submitted) => {
      onSaved(submitted);
      toast.success("Produto publicado: já aparece para os revendedores");
      await queryClient.invalidateQueries({ queryKey: supplierPanelCatalogKey(supplierId) });
    },
  });
}
