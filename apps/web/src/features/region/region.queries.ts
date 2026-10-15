import { queryOptions } from "@tanstack/react-query";
import { lookupAddress } from "./region.functions";

/** Address of a complete CEP; lookups are cached server-side, so keep results a while. */
export const addressLookupQueryOptions = (cep: string) =>
  queryOptions({
    queryKey: ["region", "address", cep],
    queryFn: () => lookupAddress({ data: { cep } }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
