import type { SellableCatalogSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getSellableCatalog } from "./catalog.functions";

export const sellableCatalogQueryOptions = (search: SellableCatalogSearch) =>
  queryOptions({
    queryKey: ["sellable-catalog", search],
    queryFn: () => getSellableCatalog({ data: search }),
    placeholderData: keepPreviousData,
  });
