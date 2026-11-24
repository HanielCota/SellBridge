import { readPackageMeasure } from "@sellbridge/shared/shipping-weight";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts } from "../../schema/index.ts";
import { createTestDatabase, createTestSupplierProduct } from "../../testing/fixtures.ts";
import { productWeightGrams } from "./product-weight.ts";

const database = createTestDatabase();
let productId = "";
let cleanup: () => Promise<void> = async () => {};

const STORED_PACKAGE_WEIGHTS = [
  "500",
  "850 g",
  "850G",
  " 1300 ",
  "450,2",
  "0.4",
  "0",
  "0.0",
  "",
  "0,5 kg",
  "-3",
  "meio quilo",
  "12 cm",
  "12x20",
  "999999999",
  "0000000001",
  "1000000000",
  "99999999999",
];

async function weightWith(values: {
  mercadoLivreAttributes: Record<string, string>;
  fiscal: Record<string, unknown>;
}): Promise<number | null> {
  await database.update(supplierProducts).set(values).where(eq(supplierProducts.id, productId));
  const [row] = await database
    .select({ weightGrams: productWeightGrams })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  if (row === undefined) {
    throw new Error("product not found");
  }
  return row.weightGrams;
}

beforeAll(async () => {
  const product = await createTestSupplierProduct(database, {
    sku: `WEIGHT-${Date.now()}`,
    title: "Bota de couro",
    costCents: 5000,
    suggestedPriceCents: 9990,
  });
  productId = product.productId;
  cleanup = product.cleanup;
});

afterAll(async () => {
  await cleanup();
});

describe("productWeightGrams", () => {
  it.each(STORED_PACKAGE_WEIGHTS)(
    "reads the packed weight %j as the fee model does",
    async (stored) => {
      const expected = readPackageMeasure(stored, "g");

      const weightGrams = await weightWith({
        mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: stored },
        fiscal: {},
      });

      expect(weightGrams).toBe(expected);
    },
  );

  it("prefers the packed weight to the product's own weight", async () => {
    const weightGrams = await weightWith({
      mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: "1300 g" },
      fiscal: { netWeightGrams: 900 },
    });

    expect(weightGrams).toBe(1300);
  });

  it("falls back to the product's own weight without a readable packed weight", async () => {
    const weightGrams = await weightWith({
      mercadoLivreAttributes: { SELLER_PACKAGE_WEIGHT: "0,5 kg" },
      fiscal: { netWeightGrams: 900 },
    });

    expect(weightGrams).toBe(900);
  });

  it("is null when the supplier gave no weight", async () => {
    const weightGrams = await weightWith({ mercadoLivreAttributes: {}, fiscal: {} });

    expect(weightGrams).toBeNull();
  });
});
