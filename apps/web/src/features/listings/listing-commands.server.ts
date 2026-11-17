import {
  type CreatedListing,
  findListingPricingScope,
  getSellableCatalogProduct,
  setListingsPaused,
  updateListingPrice,
} from "@sellbridge/database/repositories";
import { isOutOfStock } from "@sellbridge/shared/bulk-publish-plan";
import { conflictError } from "@sellbridge/shared/errors";
import { assertPriceKeepsMargin } from "@sellbridge/shared/fee-model";
import { logger } from "@sellbridge/shared/logger";
import { feeScheduleFrom } from "@/features/reports/fee-schedule";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { requestStockSync } from "@/lib/server/stock-sync";
import { type DraftOverrides, resolveListingDraft } from "./listing-draft";
import { readMercadoLivreRates } from "./mercado-livre-rates.server";
import {
  assertConnectedStores,
  assertStoresSellSuppliers,
  publishListing,
} from "./publish-listing.server";

/**
 * The listing write rules, in one place for every entry point (the app's server functions
 * and the public API), so a rule added here can never apply to one and not the other.
 */

export interface CreateListingCommand extends DraftOverrides {
  productId: string;
  storeConnectionIds: readonly string[];
}

/**
 * Sells a catalog product on the tenant's connected stores: checks the stock, the price against
 * the cost and every fee of each store's marketplace (the floor of fee-model.ts),
 * creates the listing and queues one publication per store.
 */
export async function createListingForTenant(
  tenantId: string,
  command: CreateListingCommand,
): Promise<CreatedListing> {
  const product = await getSellableCatalogProduct(database, command.productId, tenantId);
  // The batch and this flow share the rule: nothing is published that the supplier cannot ship.
  if (isOutOfStock(product.stock, environment.STOCK_SAFETY_UNITS)) {
    throw conflictError("Este produto está sem estoque. Adicione unidades antes de publicar.");
  }
  const draft = resolveListingDraft(product, command);
  const { storeIds, channels } = await assertConnectedStores(tenantId, command.storeConnectionIds);
  await assertStoresSellSuppliers(tenantId, storeIds, [product.supplierId]);
  // Only a sale the stores may make is worth asking Mercado Livre about.
  const live = await readMercadoLivreRates(tenantId, { productId: product.id, storeIds });
  assertPriceKeepsMargin(
    draft.priceCents,
    { ...product, mercadoLivreRates: live?.rates ?? null },
    feeScheduleFrom(environment),
    channels,
  );
  return publishListing(tenantId, draft, storeIds);
}

/** The repository rejects a price under the fee floor, the same rule creation applies. */
export async function updateListingPriceForTenant(
  tenantId: string,
  listingId: string,
  priceCents: number,
): Promise<void> {
  const scope = await findListingPricingScope(database, tenantId, listingId);
  const live = scope === null ? null : await readMercadoLivreRates(tenantId, scope);
  await updateListingPrice(database, tenantId, {
    listingId,
    priceCents,
    feeSchedule: feeScheduleFrom(environment),
    mercadoLivreRates: live?.rates ?? null,
  });
  logger.info("listing.price_updated", { tenantId, listingId });
  // The marketplaces get the new price now, as the screen promises, not at the next scheduled run.
  await requestStockSync("listing.sync_deferred");
}

/** Pauses (zero stock on the marketplace) or resumes listings; returns the stores changed. */
export async function setListingsPausedForTenant(
  tenantId: string,
  listingIds: readonly string[],
  paused: boolean,
): Promise<number> {
  const changed = await setListingsPaused(database, tenantId, listingIds, paused);
  logger.info(paused ? "listing.paused" : "listing.resumed", { tenantId, targets: changed });
  // A paused listing must show zero stock right away, or sales keep coming in for up to 15 min.
  if (changed > 0) {
    await requestStockSync("listing.sync_deferred");
  }
  return changed;
}
