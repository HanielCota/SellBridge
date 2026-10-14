import type { ListingOverviewRow, ListingStoreStatus } from "@sellbridge/database/repositories";
import { unavailableListingMessage } from "@sellbridge/shared/catalog-availability";
import { describe, expect, it } from "vitest";
import { listingHealth, listingRunState } from "./listing-health";

function store(
  storeName: string,
  status: ListingStoreStatus["status"],
  errorReason: string | null = null,
): ListingStoreStatus {
  return {
    id: storeName,
    storeConnectionId: `store-${storeName}`,
    status,
    errorReason,
    attempts: 1,
    externalUrl: null,
    publishedAt: null,
    storeName,
    marketplace: "mock",
  };
}

function listing(
  stores: ListingStoreStatus[],
  stock = 10,
  unavailable: ListingOverviewRow["unavailable"] = null,
): ListingOverviewRow {
  return {
    listingId: "listing-1",
    productId: "product-1",
    title: "Bermuda - Azul",
    priceCents: 9290,
    costCents: 5000,
    sku: "S-1",
    stock,
    imageUrl: null,
    categorySlug: null,
    categoryName: null,
    supplierName: "Fornecedor",
    createdAt: new Date(),
    updatedAt: new Date(),
    unitsSold: 0,
    dailySales: [],
    stores,
    unavailable,
  };
}

describe("listingHealth", () => {
  it("puts an unavailable product first, with the cause and who brings it back", () => {
    const row = listing([store("Loja A", "paused")], 0, "supplier_inactive");
    expect(listingHealth(row)).toEqual({
      tone: "attention",
      label: "Fornecedor inativo",
      reason: unavailableListingMessage("supplier_inactive"),
    });
  });

  it("names the store where the listing is live when there is only one", () => {
    expect(listingHealth(listing([store("Loja A (loja simulada)", "published")]))).toEqual({
      tone: "live",
      label: "No ar na Loja A",
      reason: null,
    });
  });

  it("counts the stores when there are several", () => {
    const row = listing([store("A", "published"), store("B", "published")]);
    expect(listingHealth(row).label).toBe("No ar em 2 lojas");
  });

  it("puts a failed store first, with the marketplace's reason", () => {
    const row = listing([store("A", "paused"), store("Shopee", "error", "Falta a marca")], 0);
    expect(listingHealth(row)).toEqual({
      tone: "error",
      label: "Erro na Shopee",
      reason: "Falta a marca",
    });
  });

  it("warns about missing stock before work in progress or pauses", () => {
    const row = listing([store("A", "publishing"), store("B", "paused")], 0);
    expect(listingHealth(row)).toMatchObject({ tone: "attention" });
  });

  it("shows publishing before pauses", () => {
    const row = listing([store("A", "pending"), store("B", "paused")]);
    expect(listingHealth(row).label).toBe("Publicando na A");
  });

  it("shows where it is paused", () => {
    const row = listing([store("A", "published"), store("B", "paused"), store("C", "paused")]);
    expect(listingHealth(row)).toMatchObject({ tone: "paused", label: "Pausado em 2 lojas" });
  });
});

describe("listingRunState", () => {
  it("is live, paused or busy by what the stores are doing", () => {
    expect(listingRunState(listing([store("A", "published")]))).toBe("live");
    expect(listingRunState(listing([store("A", "published"), store("B", "paused")]))).toBe(
      "paused",
    );
    expect(listingRunState(listing([store("A", "publishing")]))).toBe("busy");
  });

  it("is off when a store failed or the supplier ran out", () => {
    expect(listingRunState(listing([store("A", "error")]))).toBe("off");
    expect(listingRunState(listing([store("A", "published")], 0))).toBe("off");
  });
});
