import { conflictError } from "../runtime/errors.ts";

/** Mirrors the `listing_target_status` enum of the database. */
export type ListingTargetStatus = "pending" | "publishing" | "published" | "error" | "paused";

/** Statuses of a publication still on its way to the marketplace. */
export const ACTIVE_TARGET_STATUSES = [
  "pending",
  "publishing",
] as const satisfies readonly ListingTargetStatus[];

/** The only status a failed publication can be put back in the queue from. */
export const RETRYABLE_TARGET_STATUS = "error" satisfies ListingTargetStatus;

/** Selling at or below the supplier cost would lose money on every order. */
export function assertSellablePrice(priceCents: number, costCents: number): void {
  if (priceCents <= costCents) {
    throw conflictError("O preço de venda precisa ser maior que o custo do fornecedor");
  }
}

export function canRetryTarget(status: ListingTargetStatus): boolean {
  return status === RETRYABLE_TARGET_STATUS;
}

export function assertCanRetryTarget(status: ListingTargetStatus): void {
  if (!canRetryTarget(status)) {
    throw conflictError("Só é possível reprocessar publicações com erro");
  }
}

export interface PauseTransition {
  readonly from: ListingTargetStatus;
  readonly to: ListingTargetStatus;
}

/** Pausing only affects live publications; resuming only affects paused ones. */
export function pauseTransition(paused: boolean): PauseTransition {
  if (paused) {
    return { from: "published", to: "paused" };
  }
  return { from: "paused", to: "published" };
}
