import { useQuery } from "@tanstack/react-query";
import {
  type BuildStamp,
  isOutdatedPage,
  PAGE_BUILD,
  servedBuild,
  VERSION_CHECK_INTERVAL_IN_MS,
  VERSION_CHECK_TIMEOUT_IN_MS,
} from "./app-version";

const VERSION_QUERY_KEY = ["app-version"] as const;

async function fetchServedBuild(): Promise<BuildStamp | null> {
  const response = await fetch("/api/version", {
    cache: "no-store",
    signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_IN_MS),
  });
  if (!response.ok) {
    return null;
  }
  return servedBuild(await response.json());
}

/**
 * Whether a deploy replaced the build this page runs. Asks every few minutes and when the tab
 * comes back to focus; it only tells, never reloads, so nobody loses what they were typing.
 */
export function useOutdatedPage(): boolean {
  const query = useQuery({
    queryKey: VERSION_QUERY_KEY,
    queryFn: fetchServedBuild,
    refetchInterval: (current) =>
      isOutdatedPage(PAGE_BUILD, current.state.data ?? null) ? false : VERSION_CHECK_INTERVAL_IN_MS,
    // A plain true keeps the app's staleTime, so switching tabs back and forth asks once.
    refetchOnWindowFocus: (current) => !isOutdatedPage(PAGE_BUILD, current.state.data ?? null),
    retry: false,
  });

  return isOutdatedPage(PAGE_BUILD, query.data ?? null);
}
