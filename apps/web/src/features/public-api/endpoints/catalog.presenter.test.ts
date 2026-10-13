import type { RegionCatalogProduct } from "@sellbridge/database/repositories";
import { describe, expect, it } from "vitest";
import { presentCatalogProduct } from "./catalog.presenter";

const product: RegionCatalogProduct = {
  id: "product-1",
  sku: "SKU-1",
  title: "Camiseta",
  description: "Algodão",
  costCents: 2000,
  suggestedPriceCents: 4990,
  stock: 3,
  stockUpdatedAt: new Date("2026-10-01T12:00:00Z"),
  imageUrl: "https://example.com/1.jpg",
  imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
  categoryName: "Moda",
  categorySlug: "moda",
  supplierId: "supplier-1",
  supplierName: "Fornecedor",
  published: true,
};

describe("presentCatalogProduct", () => {
  it("groups the supplier and category and keeps every picture", () => {
    expect(presentCatalogProduct(product)).toMatchObject({
      supplier: { id: "supplier-1", name: "Fornecedor" },
      category: { slug: "moda", name: "Moda" },
      imageUrls: product.imageUrls,
      alreadyPublished: true,
    });
  });

  it("has no category when the product has none", () => {
    const uncategorized = { ...product, categoryName: null, categorySlug: null };
    expect(presentCatalogProduct(uncategorized).category).toBeNull();
  });
});
