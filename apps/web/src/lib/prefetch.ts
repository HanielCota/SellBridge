import type { QueryClient, QueryKey, UseQueryOptions } from "@tanstack/react-query";

/**
 * Awaits the query during SSR so the first paint has data, but only starts it on
 * client navigations: filter changes update the URL instantly and the component
 * renders its own loading state (keepPreviousData) instead of blocking navigation.
 */
export async function prefetchOnServer<TData, TKey extends QueryKey>(
  queryClient: QueryClient,
  options: UseQueryOptions<TData, Error, TData, TKey> & { queryKey: TKey },
): Promise<void> {
  const prefetch = queryClient.prefetchQuery(options);
  if (import.meta.env.SSR) {
    await prefetch;
  }
}
