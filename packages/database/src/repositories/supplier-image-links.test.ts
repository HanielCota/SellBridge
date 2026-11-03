import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts } from "../schema/index.ts";
import { createTestDatabase, createTestSupplierProduct } from "../testing/fixtures.ts";
import { listProductImageLinks } from "./supplier-image-links.ts";

const database = createTestDatabase();
const folder = `/api/produtos/imagens/${randomUUID()}/`;
let owner: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let other: Awaited<ReturnType<typeof createTestSupplierProduct>>;

async function setImages(productId: string, imageUrls: string[]) {
  await database
    .update(supplierProducts)
    .set({ imageUrls })
    .where(eq(supplierProducts.id, productId));
}

beforeAll(async () => {
  const product = { title: "Produto com foto", costCents: 1000, suggestedPriceCents: 2000 };
  owner = await createTestSupplierProduct(database, { ...product, sku: `IMG-${randomUUID()}` });
  other = await createTestSupplierProduct(database, { ...product, sku: `IMG-${randomUUID()}` });
});

afterAll(async () => {
  await owner.cleanup();
  await other.cleanup();
  await database.$client.end();
});

describe("listProductImageLinks", () => {
  it("finds the folder's photos linked from any catalog, and nothing else", async () => {
    await setImages(owner.productId, [
      `https://app.test${folder}a.png`,
      "https://cdn.test/fora.png",
    ]);
    await setImages(other.productId, [`https://app.test${folder}b.jpg`]);

    const links = await listProductImageLinks(database, folder);

    expect(links.toSorted()).toEqual([
      `https://app.test${folder}a.png`,
      `https://app.test${folder}b.jpg`,
    ]);
  });
});
