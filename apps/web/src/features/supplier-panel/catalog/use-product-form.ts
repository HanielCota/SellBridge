import {
  evaluateCompleteness,
  requiredAttributesFor,
} from "@sellbridge/shared/supplier-panel-catalog-completeness";
import type { ProductReviewStatus } from "@sellbridge/shared/supplier-panel-catalog-status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supplierPanelSubmitProduct } from "./catalog.functions";
import { supplierPanelCatalogKey } from "./catalog.queries";
import {
  completenessInput,
  editedFields,
  panelFormValues,
  type PanelFormValues,
} from "./draft-form";
import { useDraftAutosave, type SavedProduct } from "./use-draft-autosave";

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
}

/**
 * Everything the step form holds: the values being typed, the live completeness, the server
 * autosave and the submission for review.
 */
export function useProductForm({ supplierId, productId, product, categories }: ProductFormOptions) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<PanelFormValues>(() => panelFormValues(product));
  const [openedWith] = useState<PanelFormValues>(() => panelFormValues(product));
  const edited = useMemo(() => editedFields(openedWith, values), [openedWith, values]);
  const [saved, setSaved] = useState<SavedProduct | null>(product);
  const category = categories.find((option) => option.id === values.categoryId);
  const required = useMemo(() => requiredAttributesFor(category?.slug), [category?.slug]);
  const report = useMemo(
    () => evaluateCompleteness(completenessInput(values), required),
    [values, required],
  );
  const autosave = useDraftAutosave({
    supplierId,
    productId,
    values,
    initial: product,
    onSaved: (stored, sentStock) => {
      setSaved(stored);
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
  const submit = useMutation({
    mutationFn: async () => await supplierPanelSubmitProduct({ data: { supplierId, productId } }),
    onSuccess: async (submitted) => {
      setSaved(submitted);
      toast.success("Produto enviado para análise");
      await queryClient.invalidateQueries({ queryKey: supplierPanelCatalogKey(supplierId) });
    },
  });
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
  };
}
