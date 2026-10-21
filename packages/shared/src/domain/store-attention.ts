import type { StoreStatus } from "../schemas/stores.ts";

/** A store's status as the seller sees it: `attention` is connected, but the last try failed. */
export type StoreHealth = StoreStatus | "attention";

export const STORE_ATTENTION_LABEL = "Atenção";

export type StoreAccessTone = "success" | "warning" | "danger" | "muted";

/** The store's marketplace access in one line, for the store health rows. */
export interface StoreAccess {
  label: string;
  tone: StoreAccessTone;
}

/**
 * Marketplace access as the seller needs it: the token renews by itself, so its exact expiry is
 * a detail; what matters is whether it is fine, retrying, or waiting on a reconnection.
 */
export function describeStoreAccess(store: {
  status: StoreStatus;
  lastError: string | null;
}): StoreAccess {
  const health = storeHealth(store);
  return STORE_ACCESS[health];
}

const STORE_ACCESS: Record<StoreHealth, StoreAccess> = {
  connected: { label: "Em dia, renova sozinho", tone: "success" },
  attention: { label: "Renovação falhou, tentaremos de novo", tone: "warning" },
  expired: { label: "Expirado, reconecte a loja", tone: "warning" },
  error: { label: "Com erro, reconecte a loja", tone: "danger" },
  disconnected: { label: "Desconectada", tone: "muted" },
};

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
