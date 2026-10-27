import type { BrazilianState } from "@sellbridge/shared/brazilian-states";
import { queryOptions, skipToken } from "@tanstack/react-query";
import { getStateCities } from "./cities.functions";

/** The state's cities; nothing is asked until a state is chosen. They do not change in a session. */
export const stateCitiesQueryOptions = (state: BrazilianState | null) =>
  queryOptions({
    queryKey: ["cities", state],
    queryFn: state === null ? skipToken : () => getStateCities({ data: { state } }),
    staleTime: (query) => (query.state.data?.length ? 24 * 60 * 60_000 : 30_000),
    gcTime: 24 * 60 * 60_000,
  });
