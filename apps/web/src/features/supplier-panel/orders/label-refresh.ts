import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Long enough for the label request to be recorded before the screen asks again. */
export const LABEL_REFRESH_DELAY_IN_MS = 3_000;

/**
 * Refreshes the supplier's orders after a label request. The label opens in another tab (or
 * downloads), so nothing on this screen learns it was printed: marking the orders stale makes
 * them reload as soon as the supplier comes back to the tab, and a reload a few seconds later
 * covers a download that never left it.
 *
 * @returns Cancels the later reload, for when the screen closes first.
 */
export function refreshAfterLabel(queryClient: QueryClient, ordersKey: QueryKey): () => void {
  void queryClient.invalidateQueries({ queryKey: ordersKey, refetchType: "none" });
  const timer = setTimeout(() => {
    void queryClient.invalidateQueries({ queryKey: ordersKey });
  }, LABEL_REFRESH_DELAY_IN_MS);
  return () => clearTimeout(timer);
}
