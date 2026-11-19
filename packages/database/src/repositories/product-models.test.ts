import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import type {
  GridCombination,
  ProductGrid,
  ProductModelShared,
} from "@sellbridge/shared/product-grid";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productModels, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants } from "../testing/fixtures.ts";
import { recordManualOrder } from "./orders.ts";
import { createProductModel, getProductModel, updateProductModel } from "./product-models.ts";
import { ensureManualStore } from "./stores.ts";

const database = createTestDatabase();
let supplierId = "";
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

const values: ProductModelShared = {
  title: "Tênis Casual",
  description: "Couro legítimo",
  categoryId: null,
  imageUrls: ["https://cdn.example.com/capa.jpg"],
  mercadoLivreAttributes: { BRAND: "Pegada", MODEL: "Casual" },
  mercadoLivreCategoryId: "MLB23332",
  mercadoLivreCategoryName: "Tênis",
  warrantyType: null,
  warrantyDays: null,
  videoUrl: null,
  madeToOrderDays: null,
  carrierOnly: false,
  fiscal: { ncm: "64039990", origin: 0, unit: "PAR", netWeightGrams: 800 },
};

function combination(color: string, size: string, sku: string): GridCombination {
  return {
    color,
    size,
    sku,
    gtin: null,
    costCents: 5000,
    suggestedPriceCents: 9990,
    stock: 4,
    netWeightGrams: null,
  };
}

function shoeGrid(prefix: string): ProductGrid {
  return {
    colors: [
      { name: "Preto", imageUrls: ["https://cdn.example.com/preto.jpg"] },
      { name: "Branco", imageUrls: [] },
    ],
    sizes: ["38", "39"],
    combinations: [
      combination("Branco", "38", `${prefix}-B-38`),
      combination("Preto", "39", `${prefix}-P-39`),
      { ...combination("Preto", "38", `${prefix}-P-38`), gtin: "7891234567895" },
    ],
  };
}

beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Grade ${randomUUID()}`, niche: "Calçados", state: "SP", city: "Franca" })
    .returning({ id: suppliers.id });
  if (supplier === undefined) {
    throw new Error("supplier not created");
  }
  supplierId = supplier.id;
  tenants = await createTestTenants(database, 1);
});

afterAll(async () => {
  await tenants.cleanup();
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
});

async function combinationRow(sku: string) {
  const [row] = await database.select().from(supplierProducts).where(eq(supplierProducts.sku, sku));
  if (row === undefined) {
    throw new Error(`combination ${sku} not found`);
  }
  return row;
}

describe("createProductModel", () => {
  it("saves one complete product per combination, named and photographed by its colour", async () => {
    const prefix = randomUUID().slice(0, 8);

    const { modelId, combinationIds } = await createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });

    expect(combinationIds).toHaveLength(3);
    const black38 = await combinationRow(`${prefix}-P-38`);
    expect(black38).toMatchObject({
      modelId,
      color: "Preto",
      size: "38",
      title: "Tênis Casual - Preto 38",
      imageUrls: ["https://cdn.example.com/preto.jpg"],
      mercadoLivreAttributes: { BRAND: "Pegada", MODEL: "Casual", GTIN: "7891234567895" },
      variantAttributes: { GTIN: "7891234567895" },
      stock: 4,
      reviewStatus: "approved",
      fiscalRequired: true,
    });
    const white38 = await combinationRow(`${prefix}-B-38`);
    expect(white38.imageUrls).toEqual(["https://cdn.example.com/capa.jpg"]);
  });

  it("returns the model with colours, sizes and combinations in grid order", async () => {
    const prefix = randomUUID().slice(0, 8);
    const { modelId } = await createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });

    const detail = await getProductModel(database, { supplierId, modelId });

    expect(detail?.colors.map((color) => color.name)).toEqual(["Preto", "Branco"]);
    expect(detail?.sizes).toEqual(["38", "39"]);
    expect(detail?.combinations.map((entry) => entry.sku)).toEqual([
      `${prefix}-P-38`,
      `${prefix}-P-39`,
      `${prefix}-B-38`,
    ]);
    expect(detail?.values.title).toBe("Tênis Casual");
  });

  it("keeps a combination without NCM as a draft even when the team approves", async () => {
    const prefix = randomUUID().slice(0, 8);

    await createProductModel(database, {
      supplierId,
      values: { ...values, fiscal: {} },
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });

    expect((await combinationRow(`${prefix}-P-38`)).reviewStatus).toBe("draft");
  });

  it("keeps a combination without cost as a draft even when the team approves", async () => {
    const prefix = randomUUID().slice(0, 8);
    const grid = shoeGrid(prefix);

    await createProductModel(database, {
      supplierId,
      values,
      grid: {
        ...grid,
        combinations: grid.combinations.map((entry) =>
          entry.sku === `${prefix}-P-38` ? { ...entry, costCents: 0 } : entry,
        ),
      },
      reviewStatus: "approved",
    });

    expect((await combinationRow(`${prefix}-P-38`)).reviewStatus).toBe("draft");
    expect((await combinationRow(`${prefix}-P-39`)).reviewStatus).toBe("approved");
  });

  it("refuses a SKU the supplier already has and saves nothing", async () => {
    const prefix = randomUUID().slice(0, 8);
    await createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });
    const before = await database
      .select({ id: productModels.id })
      .from(productModels)
      .where(eq(productModels.supplierId, supplierId));

    const attempt = createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
    await expect(attempt).rejects.toThrow(`Já existe produto com os SKUs ${prefix}-B-38`);
    const after = await database
      .select({ id: productModels.id })
      .from(productModels)
      .where(eq(productModels.supplierId, supplierId));
    expect(after).toHaveLength(before.length);
  });

  it("does not let two combinations of a model share a colour and size", async () => {
    const prefix = randomUUID().slice(0, 8);
    const { modelId } = await createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });

    const duplicate = database.insert(supplierProducts).values({
      supplierId,
      modelId,
      color: "Preto",
      size: "38",
      sku: `${prefix}-DUP`,
      title: "Duplicado",
      costCents: 1,
      suggestedPriceCents: 1,
    });

    await expect(duplicate).rejects.toMatchObject({
      cause: { constraint_name: "supplier_products_model_combination_idx" },
    });
  });
});

describe("updateProductModel", () => {
  it("rewrites every combination's shared data and keeps its stock and barcode", async () => {
    const prefix = randomUUID().slice(0, 8);
    const { modelId } = await createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });
    await database
      .update(supplierProducts)
      .set({ stock: 9 })
      .where(eq(supplierProducts.sku, `${prefix}-P-38`));

    await updateProductModel(database, {
      supplierId,
      modelId,
      values: { ...values, title: "Tênis Urbano", mercadoLivreAttributes: { BRAND: "Pegada" } },
    });

    const black38 = await combinationRow(`${prefix}-P-38`);
    expect(black38).toMatchObject({
      title: "Tênis Urbano - Preto 38",
      mercadoLivreAttributes: { BRAND: "Pegada", GTIN: "7891234567895" },
      stock: 9,
    });
    expect((await combinationRow(`${prefix}-B-38`)).title).toBe("Tênis Urbano - Branco 38");
  });

  it("takes combinations off sale when the model loses its NF-e data", async () => {
    const prefix = randomUUID().slice(0, 8);
    const { modelId } = await createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });

    await updateProductModel(database, { supplierId, modelId, values: { ...values, fiscal: {} } });

    expect((await combinationRow(`${prefix}-P-38`)).reviewStatus).toBe("draft");
  });

  it("refuses a model of another supplier", async () => {
    const attempt = updateProductModel(database, {
      supplierId,
      modelId: randomUUID(),
      values,
    });

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "NOT_FOUND"));
  });
});

describe("stock of a combination", () => {
  it("reserves a sale only on the combination sold", async () => {
    const prefix = randomUUID().slice(0, 8);
    await createProductModel(database, {
      supplierId,
      values,
      grid: shoeGrid(prefix),
      reviewStatus: "approved",
    });
    const black38 = await combinationRow(`${prefix}-P-38`);
    const tenantId = tenants.ids[0] ?? "";
    const storeId = await ensureManualStore(database, tenantId, "shopee");

    await recordManualOrder(database, tenantId, storeId, {
      externalOrderId: `GRADE-${prefix}`,
      buyerName: "Compradora",
      orderedAt: new Date("2026-11-18T12:00:00Z"),
      marketplaceFeeCents: 0,
      items: [
        {
          supplierProductId: black38.id,
          title: black38.title,
          quantity: 2,
          unitPriceCents: 9990,
          costCents: 5000,
        },
      ],
    });

    expect((await combinationRow(`${prefix}-P-38`)).reservedStock).toBe(2);
    expect((await combinationRow(`${prefix}-P-39`)).reservedStock).toBe(0);
  });
});
