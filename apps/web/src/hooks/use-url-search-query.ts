import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

const DEFAULT_DEBOUNCE_MILLISECONDS = 300;

type UrlSearchQueryOptions = {
  /** The `query` value currently in the URL search params. */
  urlQuery: string | undefined;
  /** Writes the new query to the URL (the route decides page reset and history mode). */
  commitQuery: (query: string | undefined) => void;
  debounceMilliseconds?: number;
};

export function normalizeSearchQuery(term: string): string | undefined {
  const trimmed = term.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Local state for a search input mirrored to the URL `query` param: typing is debounced
 * before being committed, and external URL changes (back/forward, cleared filters)
 * flow back into the input without clobbering what the user is typing.
 */
export function useUrlSearchQuery({
  urlQuery,
  commitQuery,
  debounceMilliseconds = DEFAULT_DEBOUNCE_MILLISECONDS,
}: UrlSearchQueryOptions) {
  const [term, setTerm] = useState(urlQuery ?? "");
  const debouncedTerm = useDebouncedValue(term, debounceMilliseconds);
  const lastKnownQuery = useRef(urlQuery);

  const commitDebouncedTerm = useEffectEvent((nextTerm: string) => {
    const nextQuery = normalizeSearchQuery(nextTerm);
    if (nextQuery === urlQuery) {
      return;
    }
    lastKnownQuery.current = nextQuery;
    commitQuery(nextQuery);
  });

  useEffect(() => {
    commitDebouncedTerm(debouncedTerm);
  }, [debouncedTerm]);

  useEffect(() => {
    if (urlQuery === lastKnownQuery.current) {
      return;
    }
    lastKnownQuery.current = urlQuery;
    setTerm(urlQuery ?? "");
  }, [urlQuery]);

  return { term, setTerm };
}
