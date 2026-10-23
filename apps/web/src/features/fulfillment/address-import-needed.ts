import type { MarketplaceShippingAddress } from "@sellbridge/marketplaces";
import { deliveryAddressSchema } from "@sellbridge/shared/schemas";

/**
 * Whether the forward form still offers the label reader and the marketplace import. The
 * marketplace's address is stored leniently (a district can come empty), so it only replaces
 * those tools when it already passes the forward schema; otherwise they help complete it.
 */
export function addressImportNeeded(
  marketplaceAddress: MarketplaceShippingAddress | null,
): boolean {
  if (marketplaceAddress === null) {
    return true;
  }
  return !deliveryAddressSchema.safeParse(marketplaceAddress).success;
}
