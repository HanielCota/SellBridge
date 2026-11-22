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
 *
 * @param options.autoPick - False for a grid already saved: filling the guess in would save on
 *   its own when the form opens and could take approved combinations off sale, so the guess is
 *   only offered (`suggestion`) for the supplier to confirm.
 */
export function useMercadoLivreFicha(
  supplierId: string,
  values: PanelFormValues,
  setValues: Dispatch<SetStateAction<PanelFormValues>>,
  options: { autoPick: boolean } = { autoPick: true },
) {
  const { autoPick } = options;
  const category = values.mercadoLivreCategory;
  const title = useDebouncedValue(values.title.trim(), TITLE_PAUSE_IN_MS);
  const suggestions = useQuery({
    ...mercadoLivreSuggestionsQuery(supplierId, title),
    enabled: category === null && title.length >= MIN_TITLE_FOR_CATEGORY,
  });
  const firstGuess = suggestions.data?.[0] ?? null;
  useEffect(() => {
    if (firstGuess === null || !autoPick) {
      return;
    }
    setValues((current) =>
      current.mercadoLivreCategory === null
        ? { ...current, mercadoLivreCategory: firstGuess }
        : current,
    );
  }, [autoPick, firstGuess, setValues]);
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
    /** Mercado Livre's guess waiting for the supplier to confirm it (see `autoPick`). */
    suggestion: autoPick || category !== null ? null : firstGuess,
    fields: fields.data ?? null,
    loading: category !== null && fields.isPending,
    /** Mercado Livre did not answer: the form goes on with its own fields only. */
    unavailable: fields.data === null || suggestions.data === null,
  };
}

export type MercadoLivreFicha = ReturnType<typeof useMercadoLivreFicha>;
