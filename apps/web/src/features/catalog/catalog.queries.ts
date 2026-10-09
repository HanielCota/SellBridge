import type { RegionCatalogSearch } from "@sellbridge/shared/schemas";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getRegionCatalog } from "./catalog.functions";

export const regionCatalogQueryOptions = (search: RegionCatalogSearch) =>
  queryOptions({
    queryKey: ["region-catalog", search],
    queryFn: () => getRegionCatalog({ data: search }),
    placeholderData: keepPreviousData,
  });
