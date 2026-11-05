import { useQuery } from "@tanstack/react-query";
import {
  isOutdatedPage,
  BUILD_ID,
  servedBuildId,
  VERSION_CHECK_INTERVAL_IN_MS,
  VERSION_CHECK_TIMEOUT_IN_MS,
} from "./app-version";

async function fetchServedBuildId(): Promise<string | null> {
  const response = await fetch("/api/version", {
    cache: "no-store",
    signal: AbortSignal.timeout(VERSION_CHECK_TIMEOUT_IN_MS),
  });
  if (!response.ok) {
    return null;
  }
  return servedBuildId(await response.json());
}

/**
 * Whether a deploy replaced the build this page runs. Asks every few minutes and when the tab
 * comes back to focus; it only tells, never reloads, so nobody loses what they were typing.
 */
export function useOutdatedPage(): boolean {
  const query = useQuery({
    queryKey: ["app-version"],
    queryFn: fetchServedBuildId,
    refetchInterval: (current) =>
      isOutdatedPage(BUILD_ID, current.state.data ?? null) ? false : VERSION_CHECK_INTERVAL_IN_MS,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  return isOutdatedPage(BUILD_ID, query.data ?? null);
}
