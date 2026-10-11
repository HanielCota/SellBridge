import type { ListingStoreStatus } from "@sellbridge/database/repositories";
import type { ListingRunState } from "@/features/listings/listing-health";

/**
 * One color per state, the same on the card, its ··· button and the menu: green while
 * running, amber when the seller paused it, red when a problem keeps it off, blue in between.
 */
export const RUN_STATE_DOT: Record<ListingRunState, string> = {
  live: "bg-emerald-500",
  paused: "bg-amber-500",
  off: "bg-destructive",
  busy: "bg-sky-500 animate-pulse motion-reduce:animate-none",
};

export const RUN_STATE_TEXT: Record<ListingRunState, string> = {
  live: "text-emerald-700 dark:text-emerald-400",
  paused: "text-amber-700 dark:text-amber-400",
  off: "text-destructive",
  busy: "text-sky-700 dark:text-sky-400",
};

export const RUN_STATE_TINT: Record<ListingRunState, string> = {
  live: "bg-emerald-500/12",
  paused: "bg-amber-500/14",
  off: "bg-destructive/12",
  busy: "bg-sky-500/12",
};

export const RUN_STATE_LABEL: Record<ListingRunState, string> = {
  live: "No ar",
  paused: "Pausado",
  off: "Desativado",
  busy: "Publicando",
};

/** A single store's status in the same palette as the listing as a whole. */
export const STORE_STATUS_DOT: Record<ListingStoreStatus["status"], string> = {
  published: RUN_STATE_DOT.live,
  paused: RUN_STATE_DOT.paused,
  error: RUN_STATE_DOT.off,
  pending: "bg-sky-500",
  publishing: RUN_STATE_DOT.busy,
};
