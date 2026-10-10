import { queryOptions } from "@tanstack/react-query";
import { previewRegionChange } from "./region.functions";

/** Preview of a complete CEP; lookups are cached server-side, so keep results a while. */
export const regionPreviewQueryOptions = (cep: string) =>
  queryOptions({
    queryKey: ["region", "preview", cep],
    queryFn: () => previewRegionChange({ data: { cep } }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
