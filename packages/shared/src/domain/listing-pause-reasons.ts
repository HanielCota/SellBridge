import { z } from "zod";

/**
 * Why a publication is paused, stored with it (`listing_targets.pause_reason`). The column is
 * text, not a database enum, so a new reason (such as a cost rise) only needs a line here.
 */
export const LISTING_PAUSE_REASONS = [
  "seller",
  "store_disconnected",
  "supplier_unavailable",
  "product_archived",
  "store_supplier_changed",
  "price_below_floor",
] as const;

export type ListingPauseReason = (typeof LISTING_PAUSE_REASONS)[number];

export const listingPauseReasonSchema = z.enum(LISTING_PAUSE_REASONS);

/** The reason as the reseller reads it on the listing card. */
export const LISTING_PAUSE_REASON_LABELS: Readonly<Record<ListingPauseReason, string>> = {
  seller: "Pausado por você",
  store_disconnected: "Pausado quando a loja foi desconectada",
  supplier_unavailable: "Pausado porque o fornecedor tirou o produto de venda",
  product_archived: "Pausado porque o produto foi arquivado",
  store_supplier_changed: "Pausado porque a loja passou a vender outro fornecedor",
  price_below_floor:
    "Pausado porque o preço não cobre o custo e as taxas. Ajuste o preço para reativar.",
};

/** A stored reason, or null when there is none or it is not one this version knows. */
export function readListingPauseReason(
  value: string | null | undefined,
): ListingPauseReason | null {
  const parsed = listingPauseReasonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Reconnecting the store offers to resume only what the disconnection paused. */
export function resumesOnReconnection(reason: ListingPauseReason | null): boolean {
  return reason === "store_disconnected";
}
