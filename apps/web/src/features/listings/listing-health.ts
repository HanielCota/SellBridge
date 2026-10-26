import type { ListingOverviewRow, ListingStoreStatus } from "@sellbridge/database/repositories";
import {
  unavailableListingLabel,
  unavailableListingMessage,
} from "@sellbridge/shared/catalog-availability";

export type ListingHealthTone = "live" | "error" | "attention" | "busy" | "paused";

/** The one line a card shows about a listing: what matters most right now. */
export interface ListingHealth {
  tone: ListingHealthTone;
  label: string;
  /** Why it is not live, when the marketplace said so. */
  reason: string | null;
}

type StoreStatus = ListingStoreStatus["status"];

function storesWith(
  stores: readonly ListingStoreStatus[],
  statuses: readonly StoreStatus[],
): ListingStoreStatus[] {
  return stores.filter((store) => statuses.includes(store.status));
}

/** "na Loja X" for a single store, "em 3 lojas" otherwise. */
function whereLabel(stores: readonly ListingStoreStatus[]): string {
  const [onlyStore] = stores;
  if (stores.length === 1 && onlyStore) {
    return `na ${onlyStore.storeName}`;
  }
  return `em ${stores.length} lojas`;
}

/**
 * Problems first: a product the supplier no longer offers (whatever the stores say, it is the
 * cause), a failed store, a supplier out of stock, then work in progress and pauses. Only when
 * nothing needs attention does the card say where the product is live.
 */
export function listingHealth(row: ListingOverviewRow): ListingHealth {
  if (row.unavailable !== null) {
    return {
      tone: "attention",
      label: unavailableListingLabel(row.unavailable),
      reason: unavailableListingMessage(row.unavailable),
    };
  }
  const failed = storesWith(row.stores, ["error"]);
  if (failed.length > 0) {
    const reason = failed.find((store) => store.errorReason !== null)?.errorReason ?? null;
    return { tone: "error", label: `Erro ${whereLabel(failed)}`, reason };
  }
  if (row.stock <= 0) {
    return { tone: "attention", label: "Sem estoque no fornecedor", reason: null };
  }
  const inProgress = storesWith(row.stores, ["pending", "publishing"]);
  if (inProgress.length > 0) {
    return { tone: "busy", label: `Publicando ${whereLabel(inProgress)}`, reason: null };
  }
  const paused = storesWith(row.stores, ["paused"]);
  if (paused.length > 0) {
    return { tone: "paused", label: `Pausado ${whereLabel(paused)}`, reason: null };
  }
  return { tone: "live", label: `No ar ${whereLabel(row.stores)}`, reason: null };
}

/** The listing's state as one color: running, paused by the seller, or blocked by a problem. */
export type ListingRunState = "live" | "paused" | "off" | "busy";

const RUN_STATES: Record<ListingHealthTone, ListingRunState> = {
  live: "live",
  paused: "paused",
  busy: "busy",
  error: "off",
  attention: "off",
};

/** A failed store or a supplier out of stock both keep the product off, whatever was chosen. */
export function listingRunState(row: ListingOverviewRow): ListingRunState {
  return RUN_STATES[listingHealth(row).tone];
}

/**
 * The state the card names. A live or paused listing the supplier's catalog stops is paused by
 * the rule, not broken: it reads "Pausado", like the tab that counts it, while keeping the
 * problem's color. One that never went live (only failed or queued stores) keeps its run state.
 */
export function listingNamedState(row: ListingOverviewRow): ListingRunState {
  const countsAsPaused = storesWith(row.stores, ["published", "paused"]).length > 0;
  if (row.unavailable !== null && countsAsPaused) {
    return "paused";
  }
  return listingRunState(row);
}
