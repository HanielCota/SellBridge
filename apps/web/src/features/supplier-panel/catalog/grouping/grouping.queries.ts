import { queryOptions } from "@tanstack/react-query";
import { supplierPanelCatalogKey } from "../catalog.queries";
import { supplierPanelGetGroupingSuggestions } from "./grouping.functions";

export const supplierPanelGroupingSuggestionsQueryOptions = (supplierId: string) =>
  queryOptions({
    queryKey: [...supplierPanelCatalogKey(supplierId), "grouping-suggestions"],
    queryFn: () => supplierPanelGetGroupingSuggestions({ data: { supplierId } }),
  });
