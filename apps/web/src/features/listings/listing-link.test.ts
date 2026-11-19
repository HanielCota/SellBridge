import type { ListingStoreStatus } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { listingLink, storeListingLinks } from "./listing-link";

const PERMALINK = "https://produto.mercadolivre.com.br/MLB-1234567890-bolsinha-infantil-preto-_JM";

function store(storeName: string, overrides: Partial<ListingStoreStatus> = {}): ListingStoreStatus {
  return {
    id: `target-${storeName}`,
    storeConnectionId: `store-${storeName}`,
    status: "published",
    errorReason: null,
    pauseReason: null,
    descriptionError: null,
    attempts: 1,
    externalUrl: PERMALINK,
    publishedAt: null,
    storeName,
    marketplace: "mercado_livre",
    ...overrides,
  };
}

describe("listingLink", () => {
  it("opens the Mercado Livre permalink of a published ad", () => {
    const link = listingLink({
      marketplace: "mercado_livre",
      status: "published",
      externalUrl: PERMALINK,
    });

    expect(link).toEqual({ kind: "open", url: PERMALINK });
  });

  it("opens a paused ad, which stays on Mercado Livre at zero stock", () => {
    const link = listingLink({
      marketplace: "mercado_livre",
      status: "paused",
      externalUrl: PERMALINK,
    });

    expect(link).toEqual({ kind: "open", url: PERMALINK });
  });

  it("waits when a published ad has no link from Mercado Livre yet", () => {
    const link = listingLink({
      marketplace: "mercado_livre",
      status: "published",
      externalUrl: null,
    });

    expect(link).toEqual({ kind: "waiting" });
  });

  it("waits instead of opening a link that is not https", () => {
    const insecure = listingLink({
      marketplace: "mercado_livre",
      status: "published",
      externalUrl: "javascript:alert(1)",
    });
    const broken = listingLink({
      marketplace: "mercado_livre",
      status: "published",
      externalUrl: "not a url",
    });

    expect(insecure).toEqual({ kind: "waiting" });
    expect(broken).toEqual({ kind: "waiting" });
  });

  it.each(["pending", "publishing", "error"] as const)(
    "shows nothing for an ad that is %s",
    (status) => {
      const link = listingLink({ marketplace: "mercado_livre", status, externalUrl: PERMALINK });

      expect(link).toEqual({ kind: "none" });
    },
  );

  it("shows nothing when the order item has no ad anymore", () => {
    const link = listingLink({ marketplace: "mercado_livre", status: null, externalUrl: null });

    expect(link).toEqual({ kind: "none" });
  });

  it("shows nothing for another marketplace", () => {
    const link = listingLink({
      marketplace: "tiktok_shop",
      status: "published",
      externalUrl: null,
    });

    expect(link).toEqual({ kind: "none" });
  });
});

describe("storeListingLinks", () => {
  it("keeps only the stores with a Mercado Livre ad, in order", () => {
    const stores = [
      store("Loja Centro"),
      store("Loja TikTok", { marketplace: "tiktok_shop", externalUrl: null }),
      store("Loja Nova", { externalUrl: null }),
      store("Loja Parada", { status: "error" }),
    ];

    const links = storeListingLinks(stores);

    expect(links).toEqual([
      {
        storeId: "target-Loja Centro",
        storeName: "Loja Centro",
        link: { kind: "open", url: PERMALINK },
      },
      { storeId: "target-Loja Nova", storeName: "Loja Nova", link: { kind: "waiting" } },
    ]);
  });

  it("returns no link when the product is not on Mercado Livre", () => {
    const links = storeListingLinks([]);

    expect(links).toEqual([]);
  });
});
