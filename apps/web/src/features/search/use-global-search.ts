import { useQuery } from "@tanstack/react-query";
import { searchEverythingFn } from "@/features/search/search.functions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/** Shorter terms match too much to be useful, so they skip the server. */
const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MILLISECONDS = 200;

export type GlobalSearchResults = Awaited<ReturnType<typeof searchEverythingFn>>;

/**
 * Products, listings and orders matching what is typed in the command palette, fetched
 * once typing pauses. Null while the term is too short or the first answer is loading.
 */
export function useGlobalSearch(term: string): GlobalSearchResults | null {
  const debounced = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MILLISECONDS);
  const enabled = debounced.length >= MIN_QUERY_LENGTH;
  const query = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => searchEverythingFn({ data: { query: debounced } }),
    enabled,
    staleTime: 30_000,
  });
  if (!enabled || !query.data) {
    return null;
  }
  return query.data;
}
