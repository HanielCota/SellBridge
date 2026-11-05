import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  type BuildStamp,
  isOutdatedPage,
  PAGE_BUILD,
  servedBuild,
  VERSION_CHECK_INTERVAL_IN_MS,
  VERSION_CHECK_REQUEST_EVENT,
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
 * Whether a deploy replaced the build this page runs. Asks every few minutes, when the tab
 * comes back to focus and when a server call fails; it only tells, never reloads, so nobody
 * loses what they were typing.
 */
export function useOutdatedPage(): boolean {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: VERSION_QUERY_KEY,
    queryFn: fetchServedBuild,
    refetchInterval: (current) =>
      isOutdatedPage(PAGE_BUILD, current.state.data ?? null) ? false : VERSION_CHECK_INTERVAL_IN_MS,
    // A plain true keeps the app's staleTime, so switching tabs back and forth asks once.
    refetchOnWindowFocus: (current) => !isOutdatedPage(PAGE_BUILD, current.state.data ?? null),
    retry: false,
  });

  useEffect(() => {
    // A failed server call is the first sign of a deploy: the old page may call a function the
    // new server no longer has, so ask at once instead of waiting for the next check.
    const checkNow = () => {
      void queryClient.refetchQueries({ queryKey: VERSION_QUERY_KEY });
    };
    window.addEventListener(VERSION_CHECK_REQUEST_EVENT, checkNow);
    return () => window.removeEventListener(VERSION_CHECK_REQUEST_EVENT, checkNow);
  }, [queryClient]);

  return isOutdatedPage(PAGE_BUILD, query.data ?? null);
}
