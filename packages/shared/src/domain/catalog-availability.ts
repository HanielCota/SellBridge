/**
 * Whether a supplier product can still be offered by a reseller. The database mirrors this in
 * `sellableOnMarketplace` (repositories/sql/sellable.ts): stock synced to the marketplaces
 * drops to zero while any check fails. Where the reseller lives plays no part: any reseller
 * sells any supplier in Brazil.
 */
export interface CatalogAvailability {
  productActive: boolean;
  supplierActive: boolean;
}

export type UnavailableReason = "supplier_inactive" | "product_inactive";

/** The first check that fails, supplier first: reactivating the product alone would not help. */
export function unavailableReason(availability: CatalogAvailability): UnavailableReason | null {
  if (!availability.supplierActive) {
    return "supplier_inactive";
  }
  if (!availability.productActive) {
    return "product_inactive";
  }
  return null;
}

const UNAVAILABLE_MESSAGES: Record<UnavailableReason, string> = {
  supplier_inactive:
    "O fornecedor deste produto está inativo. Quando ele voltar ao catálogo, reprocesse a publicação.",
  product_inactive:
    "This product is unavailable. Retry the publication when it becomes available again.",
};

/** Why a queued publication was not sent, and what the reseller can do (listing card). */
export function unavailableMessage(reason: UnavailableReason): string {
  return UNAVAILABLE_MESSAGES[reason];
}

const LISTING_LABELS: Record<UnavailableReason, string> = {
  supplier_inactive: "Fornecedor inativo",
  product_inactive: "Product unavailable",
};

const LISTING_MESSAGES: Record<UnavailableReason, string> = {
  supplier_inactive:
    "O fornecedor está inativo. O anúncio fica pausado; reative quando ele voltar ao catálogo.",
  product_inactive:
    "This product is unavailable. Its listings stay paused until it becomes available again and you resume them.",
};

/** The cause in a few words, on the listing card. */
export function unavailableListingLabel(reason: UnavailableReason): string {
  return LISTING_LABELS[reason];
}

/** Why a live listing stopped and who brings it back (card and bell). */
export function unavailableListingMessage(reason: UnavailableReason): string {
  return LISTING_MESSAGES[reason];
}
