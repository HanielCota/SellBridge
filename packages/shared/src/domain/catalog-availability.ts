/**
 * Whether a reseller's listing of a supplier product can still sell. The database mirrors this in
 * `listingSellable` (repositories/sql/sellable.ts), built on `sellableOnMarketplace` for the
 * product checks: stock synced to the marketplaces drops to zero while any check fails. Where the
 * reseller lives plays no part: any reseller sells any supplier in Brazil.
 */
export interface CatalogAvailability {
  productActive: boolean;
  supplierActive: boolean;
  /**
   * The listing's price is above the supplier's current cost. A supplier raising the cost past
   * the price made every sale a loss, and nothing stopped it or told the reseller.
   */
  priceCoversCost: boolean;
}

export type UnavailableReason = "supplier_inactive" | "product_inactive" | "cost_above_price";

/**
 * The first check that fails, supplier first: reactivating the product alone would not help,
 * and a new price only matters once the product can be sold at all.
 */
export function unavailableReason(availability: CatalogAvailability): UnavailableReason | null {
  if (!availability.supplierActive) {
    return "supplier_inactive";
  }
  if (!availability.productActive) {
    return "product_inactive";
  }
  if (!availability.priceCoversCost) {
    return "cost_above_price";
  }
  return null;
}

const UNAVAILABLE_MESSAGES: Record<UnavailableReason, string> = {
  supplier_inactive:
    "O fornecedor deste produto está inativo. Quando ele voltar ao catálogo, reprocesse a publicação.",
  product_inactive:
    "Este produto está indisponível. Tente publicar novamente quando ele estiver disponível.",
  cost_above_price:
    "O custo do fornecedor passou do preço de venda. Aumente o preço para publicar sem prejuízo.",
};

/** Why a queued publication was not sent, and what the reseller can do (listing card). */
export function unavailableMessage(reason: UnavailableReason): string {
  return UNAVAILABLE_MESSAGES[reason];
}

const LISTING_LABELS: Record<UnavailableReason, string> = {
  supplier_inactive: "Fornecedor inativo",
  product_inactive: "Produto indisponível",
  cost_above_price: "Custo acima do preço",
};

const LISTING_MESSAGES: Record<UnavailableReason, string> = {
  supplier_inactive:
    "O fornecedor está inativo. O anúncio fica pausado; reative quando ele voltar ao catálogo.",
  product_inactive:
    "Este produto está indisponível. Os anúncios ficam pausados até ele estar disponível novamente e você reativá-los.",
  cost_above_price:
    "O fornecedor mudou o custo e ele passou do seu preço de venda. O anúncio foi pausado para você não vender no prejuízo. Aumente o preço para voltar a vender.",
};

/** The cause in a few words, on the listing card. */
export function unavailableListingLabel(reason: UnavailableReason): string {
  return LISTING_LABELS[reason];
}

/** Why a live listing stopped and who brings it back (card and bell). */
export function unavailableListingMessage(reason: UnavailableReason): string {
  return LISTING_MESSAGES[reason];
}
