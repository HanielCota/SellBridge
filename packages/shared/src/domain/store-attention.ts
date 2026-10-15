import type { StoreStatus } from "../schemas/stores.ts";

/** A store's status as the seller sees it: `attention` is connected, but the last try failed. */
export type StoreHealth = StoreStatus | "attention";

export const STORE_ATTENTION_LABEL = "Atenção";

/**
 * A connected store whose last token refresh failed for a reason other than its grant (a timeout,
 * a marketplace 5xx) keeps syncing and is retried, but the seller should see it. The worker
 * records the reason in `lastError` and clears it on the next success or reconnection.
 */
export function storeHealth(store: { status: StoreStatus; lastError: string | null }): StoreHealth {
  if (store.status !== "connected") {
    return store.status;
  }
  const reason = store.lastError?.trim();
  if (reason === undefined || reason === "") {
    return "connected";
  }
  return "attention";
}
