import type { QueryClient } from "@tanstack/react-query";
import type { AppSession } from "./session.functions";

/** How long a browser tab reuses the signed-in session before asking the server again. */
export const SESSION_REUSE_TIME_IN_MS = 30_000;

const SESSION_QUERY_ROOT = "app-session";

/**
 * The session for one tab profile, asked of the server at most once every 30 s: every click and
 * link hover runs the app layout's guard, and each ask is a round trip before the page's data.
 * A signed-out answer is never kept, so a sign-in shows on the next navigation.
 */
export async function reuseAppSession(
  queryClient: QueryClient,
  profile: string | null,
  fetchSession: () => Promise<AppSession | null>,
): Promise<AppSession | null> {
  const queryKey = [SESSION_QUERY_ROOT, profile];
  const session = await queryClient.fetchQuery({
    queryKey,
    queryFn: fetchSession,
    staleTime: SESSION_REUSE_TIME_IN_MS,
    gcTime: SESSION_REUSE_TIME_IN_MS,
    // A failed ask surfaces at once, as it did before the session was reused.
    retry: false,
  });
  if (session === null) {
    queryClient.removeQueries({ queryKey, exact: true });
  }
  return session;
}

/** Makes the next navigation ask the server who is signed in, for every profile of the tab. */
export function forgetAppSession(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: [SESSION_QUERY_ROOT] });
}

/**
 * `invalidate` that first forgets the reused session: the screens call `router.invalidate()`
 * after a change the session shows (profile edit, team mode, terms, onboarding).
 */
export function invalidateWithFreshSession<TOptions>(
  invalidate: (options?: TOptions) => Promise<void>,
  queryClient: QueryClient,
): (options?: TOptions) => Promise<void> {
  return (options) => {
    forgetAppSession(queryClient);
    return invalidate(options);
  };
}
