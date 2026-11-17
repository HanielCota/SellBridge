import type { ListingStoreStatus } from "@sellbridge/database/repositories";

type StoreStatus = ListingStoreStatus["status"];
type Marketplace = ListingStoreStatus["marketplace"];

/** Statuses where the ad exists on Mercado Livre: a paused one is live at zero stock. */
const LIVE_STATUSES: readonly StoreStatus[] = ["published", "paused"];

/** The words shown while Mercado Livre has not sent the ad's link yet. */
export const LISTING_LINK_WAITING_MESSAGE = "O Mercado Livre ainda não mandou o link deste anúncio";

export type ListingLink = { kind: "open"; url: string } | { kind: "waiting" } | { kind: "none" };

export interface ListingLinkSource {
  marketplace: Marketplace;
  status: StoreStatus | null;
  externalUrl: string | null;
}

/** Only an https page opens; anything else waits for a real link instead of opening it. */
function safeListingUrl(value: string | null): string | null {
  if (value === null || !URL.canParse(value)) {
    return null;
  }
  return new URL(value).protocol === "https:" ? value : null;
}

/**
 * What "Ver anúncio" does for one store: open the ad, explain that Mercado Livre has not sent its
 * link yet, or not show at all (another marketplace, or an ad that is not on the air).
 */
export function listingLink(source: ListingLinkSource): ListingLink {
  if (source.marketplace !== "mercado_livre") {
    return { kind: "none" };
  }
  if (source.status === null || !LIVE_STATUSES.includes(source.status)) {
    return { kind: "none" };
  }
  const url = safeListingUrl(source.externalUrl);
  if (url === null) {
    return { kind: "waiting" };
  }
  return { kind: "open", url };
}

export interface StoreListingLink {
  storeId: string;
  storeName: string;
  link: Exclude<ListingLink, { kind: "none" }>;
}

/** Every store where the product has a Mercado Livre ad, with what its button does. */
export function storeListingLinks(stores: readonly ListingStoreStatus[]): StoreListingLink[] {
  const links: StoreListingLink[] = [];
  for (const store of stores) {
    const link = listingLink(store);
    if (link.kind !== "none") {
      links.push({ storeId: store.id, storeName: store.storeName, link });
    }
  }
  return links;
}
