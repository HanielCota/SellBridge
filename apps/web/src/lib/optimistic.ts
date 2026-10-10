import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Every cached query under a key as it was before an optimistic change. */
export type CacheSnapshot<TData> = [QueryKey, TData | undefined][];

/**
 * Stops in-flight fetches under `queryKey` (so they cannot overwrite the optimistic data)
 * and remembers the current cache to roll back to.
 */
export async function snapshotQueries<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
): Promise<CacheSnapshot<TData>> {
  await queryClient.cancelQueries({ queryKey });
  return queryClient.getQueriesData<TData>({ queryKey });
}

/** Puts back the cache saved by `snapshotQueries` after the server refused a change. */
export function restoreQueries<TData>(
  queryClient: QueryClient,
  snapshot: CacheSnapshot<TData> | undefined,
) {
  for (const [key, data] of snapshot ?? []) {
    queryClient.setQueryData(key, data);
  }
}
