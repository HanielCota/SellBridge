import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts } from "../schema/index.ts";
import { createTestDatabase, createTestSupplierProduct } from "../testing/fixtures.ts";
import { listSupplierProductPhotos } from "./supplier-panel-home-photos.ts";

const database = createTestDatabase();
const PHOTO = "https://example.com/vaso.jpg";

let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let otherSupplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let sku = "";
let otherSku = "";

beforeAll(async () => {
  sku = `PHOTO-${randomUUID()}`;
  otherSku = `PHOTO-OTHER-${randomUUID()}`;
  supplier = await createTestSupplierProduct(database, {
    sku,
    title: "Vaso",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  otherSupplier = await createTestSupplierProduct(database, {
    sku: otherSku,
    title: "Copo",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  await database
    .update(supplierProducts)
    .set({ imageUrls: [PHOTO, "https://example.com/vaso-2.jpg"] })
    .where(eq(supplierProducts.id, supplier.productId));
  await database
    .update(supplierProducts)
    .set({ imageUrls: ["https://example.com/copo.jpg"] })
    .where(eq(supplierProducts.id, otherSupplier.productId));
});

afterAll(async () => {
  await supplier.cleanup();
  await otherSupplier.cleanup();
  await database.$client.end();
});

describe("listSupplierProductPhotos", () => {
  it("returns the first photo of the supplier's own products by SKU", async () => {
    const photos = await listSupplierProductPhotos(database, {
      supplierId: supplier.supplierId,
      skus: [sku, otherSku, "SEM-PRODUTO", ""],
    });
    expect([...photos]).toEqual([[sku, PHOTO]]);
  });

  it("leaves out products without a photo", async () => {
    await database
      .update(supplierProducts)
      .set({ imageUrls: [] })
      .where(eq(supplierProducts.id, supplier.productId));
    const photos = await listSupplierProductPhotos(database, {
      supplierId: supplier.supplierId,
      skus: [sku],
    });
    expect(photos.size).toBe(0);
  });

  it("skips the query when there is no SKU to look up", async () => {
    const photos = await listSupplierProductPhotos(database, {
      supplierId: supplier.supplierId,
      skus: [],
    });
    expect(photos.size).toBe(0);
  });
});
