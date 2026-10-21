import type { ListingOverviewRow, ListingStoreStatus } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import {
  countTargetStatuses,
  presentListing,
  summarizeListingStatus,
} from "./listings-read.presenter";

function store(
  status: ListingStoreStatus["status"],
  overrides: Partial<ListingStoreStatus> = {},
): ListingStoreStatus {
  return {
    id: `target-${status}`,
    storeConnectionId: `store-${status}`,
    status,
    errorReason: null,
    descriptionError: null,
    attempts: 1,
    externalUrl: null,
    publishedAt: null,
    storeName: "Loja",
    marketplace: "mock",
    ...overrides,
  };
}

function listing(stores: ListingStoreStatus[]): ListingOverviewRow {
  return {
    listingId: "listing-1",
    productId: "product-1",
    title: "Bermuda",
    priceCents: 9290,
    costCents: 5000,
    sku: "S-1",
    stock: 4,
    imageUrl: null,
    categorySlug: null,
    categoryName: null,
    supplierName: "Fornecedor",
    createdAt: new Date("2026-03-01T10:00:00Z"),
    updatedAt: new Date("2026-03-02T10:00:00Z"),
    unitsSold: 3,
    dailySales: [],
    stores,
    unavailable: null,
  };
}

describe("summarizeListingStatus", () => {
  it("puts what needs attention first", () => {
    expect(summarizeListingStatus(["published", "error", "publishing"])).toBe("error");
    expect(summarizeListingStatus(["published", "pending"])).toBe("pending");
    expect(summarizeListingStatus(["published", "paused"])).toBe("paused");
    expect(summarizeListingStatus(["published"])).toBe("published");
    expect(summarizeListingStatus([])).toBe("pending");
  });

  it("counts every status, zero included", () => {
    expect(countTargetStatuses(["published", "published", "error"])).toEqual({
      pending: 0,
      publishing: 0,
      published: 2,
      paused: 0,
      error: 1,
    });
  });
});

describe("presentListing", () => {
  it("maps each store to a target with ISO dates", () => {
    const live = store("published", {
      externalUrl: "https://example.com/item",
      publishedAt: new Date("2026-03-01T12:00:00Z"),
    });
    const dto = presentListing(listing([live, store("error", { errorReason: "Recusado" })]));
    expect(dto).toMatchObject({
      id: "listing-1",
      productId: "product-1",
      status: "error",
      unitsSoldLast30Days: 3,
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-02T10:00:00.000Z",
    });
    expect(dto.targets).toEqual([
      {
        storeId: "store-published",
        storeName: "Loja",
        marketplace: "mock",
        status: "published",
        externalUrl: "https://example.com/item",
        errorReason: null,
        publishedAt: "2026-03-01T12:00:00.000Z",
      },
      expect.objectContaining({ storeId: "store-error", errorReason: "Recusado" }),
    ]);
  });

  it("hides an old error reason once the store is no longer failing", () => {
    const dto = presentListing(listing([store("published", { errorReason: "antigo" })]));
    expect(dto.targets[0]?.errorReason).toBeNull();
  });

  it("dates a listing without stores by its creation", () => {
    const row = { ...listing([]), updatedAt: new Date(Number.NaN) };
    expect(presentListing(row).updatedAt).toBe("2026-03-01T10:00:00.000Z");
  });
});
