/**
 * Whether a supplier product can still be offered by a reseller. The database mirrors this in
 * `sellableOnMarketplace` (repositories/sql/supplier-coverage.ts): stock synced to the
 * marketplaces drops to zero while any check fails.
 */
export interface CatalogAvailability {
  productActive: boolean;
  supplierActive: boolean;
  /** The supplier delivers to the reseller's city or state (supplier_coverage). */
  regionCovered: boolean;
}

export type UnavailableReason = "supplier_inactive" | "product_inactive" | "outside_region";

/** The first check that fails, supplier first: reactivating the product alone would not help. */
export function unavailableReason(availability: CatalogAvailability): UnavailableReason | null {
  if (!availability.supplierActive) {
    return "supplier_inactive";
  }
  if (!availability.productActive) {
    return "product_inactive";
  }
  if (!availability.regionCovered) {
    return "outside_region";
  }
  return null;
}

const UNAVAILABLE_MESSAGES: Record<UnavailableReason, string> = {
  supplier_inactive:
    "O fornecedor deste produto está inativo. Quando ele voltar ao catálogo, reprocesse a publicação.",
  product_inactive:
    "Este produto saiu do catálogo do fornecedor. Quando ele voltar, reprocesse a publicação.",
  outside_region:
    "O fornecedor não entrega mais na sua região. Escolha outro produto no catálogo para vender no lugar.",
};

/** Why a queued publication was not sent, and what the reseller can do (listing card). */
export function unavailableMessage(reason: UnavailableReason): string {
  return UNAVAILABLE_MESSAGES[reason];
}
