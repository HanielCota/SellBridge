import { useQuery } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  supplierPanelMercadoLivreCategoryFields,
  supplierPanelSuggestMercadoLivreCategories,
} from "./catalog.functions";
import { supplierPanelCatalogKey } from "./catalog.queries";
import type { PanelFormValues } from "./draft-form";
import { MIN_TITLE_FOR_CATEGORY } from "./mercado-livre-ficha";

/** The title stops changing for this long before Mercado Livre is asked for its category. */
const TITLE_PAUSE_IN_MS = 800;

export function mercadoLivreSuggestionsQuery(supplierId: string, title: string) {
  return {
    queryKey: [...supplierPanelCatalogKey(supplierId), "mercado-livre-categories", title],
    queryFn: async () =>
      await supplierPanelSuggestMercadoLivreCategories({ data: { supplierId, title } }),
    staleTime: Number.POSITIVE_INFINITY,
  };
}

/**
 * The Mercado Livre category of the product and its technical sheet. A product without one gets
 * Mercado Livre's first guess for its title, which the supplier can change.
 */
export function useMercadoLivreFicha(
  supplierId: string,
  values: PanelFormValues,
  setValues: Dispatch<SetStateAction<PanelFormValues>>,
) {
  const category = values.mercadoLivreCategory;
  const title = useDebouncedValue(values.title.trim(), TITLE_PAUSE_IN_MS);
  const suggestions = useQuery({
    ...mercadoLivreSuggestionsQuery(supplierId, title),
    enabled: category === null && title.length >= MIN_TITLE_FOR_CATEGORY,
  });
  const firstGuess = suggestions.data?.[0] ?? null;
  useEffect(() => {
    if (firstGuess === null) {
      return;
    }
    setValues((current) =>
      current.mercadoLivreCategory === null
        ? { ...current, mercadoLivreCategory: firstGuess }
        : current,
    );
  }, [firstGuess, setValues]);
  const fields = useQuery({
    queryKey: [...supplierPanelCatalogKey(supplierId), "mercado-livre-fields", category?.id],
    queryFn: async () =>
      category === null
        ? null
        : await supplierPanelMercadoLivreCategoryFields({
            data: { supplierId, categoryId: category.id },
          }),
    enabled: category !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return {
    category,
    fields: fields.data ?? null,
    loading: category !== null && fields.isPending,
    /** Mercado Livre did not answer: the form goes on with its own fields only. */
    unavailable: fields.data === null || suggestions.data === null,
  };
}

export type MercadoLivreFicha = ReturnType<typeof useMercadoLivreFicha>;
