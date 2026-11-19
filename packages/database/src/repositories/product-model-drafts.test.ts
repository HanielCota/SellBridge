import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import type { ProductGridDraft } from "@sellbridge/shared/product-grid";
import type {
  CatalogSaveModelDraftInput,
  ModelDraftValues,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import {
  deleteUnsoldProductModel,
  publishProductModel,
  saveProductModelDraft,
} from "./product-model-drafts.ts";
import { getProductModel } from "./product-models.ts";
import {
  listSupplierPanelProducts,
  supplierCatalogExportBatches,
} from "./supplier-panel-catalog.ts";

const database = createTestDatabase();
let supplierId = "";
let categoryId = "";

const noFiscal: ModelDraftValues["fiscal"] = {
  ncm: null,
  origin: null,
  unit: null,
  cest: null,
  netWeightGrams: null,
  cfopInState: null,
  cfopOutOfState: null,
  icmsCode: null,
  pisCofinsCst: null,
};

const values: ModelDraftValues = {
  title: "Tênis Casual Couro",
  description: "Tênis de couro legítimo com solado de borracha.",
  categoryId: null,
  imageUrls: ["https://cdn.example.com/capa.jpg"],
  mercadoLivreAttributes: { BRAND: "Pegada", MODEL: "Casual" },
  mercadoLivreCategoryId: null,
  mercadoLivreCategoryName: null,
  warrantyType: null,
  warrantyDays: null,
  videoUrl: null,
  madeToOrderDays: null,
  carrierOnly: false,
  fiscal: { ...noFiscal, ncm: "64039990", origin: 0, unit: "PAR" },
};

function combination(color: string, size: string, sku: string) {
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

function grid(prefix: string): ProductGridDraft {
  return {
    colors: [{ name: "Preto", imageUrls: ["https://cdn.example.com/preto.jpg"] }],
    sizes: [{ name: "38" }, { name: "39" }],
    combinations: [
      combination("Preto", "38", `${prefix}-P-38`),
      combination("Preto", "39", `${prefix}-P-39`),
    ],
  };
}

function draft(prefix: string, modelId = randomUUID()): CatalogSaveModelDraftInput {
  return { supplierId, modelId, values: { ...values, categoryId }, grid: grid(prefix) };
}

async function rowOf(sku: string) {
  const [row] = await database.select().from(supplierProducts).where(eq(supplierProducts.sku, sku));
  return row;
}

beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Rascunho ${randomUUID()}`, niche: "Calçados", state: "SP", city: "Franca" })
    .returning({ id: suppliers.id });
  supplierId = supplier?.id ?? "";
  const [category] = await database
    .insert(categories)
    .values({ name: "Calçados rascunho", slug: `calcados-${randomUUID()}` })
    .returning({ id: categories.id });
  categoryId = category?.id ?? "";
});

afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  await database.delete(categories).where(eq(categories.id, categoryId));
});

describe("saveProductModelDraft", () => {
  it("creates the model on the first save, with every combination as a draft", async () => {
    const prefix = randomUUID().slice(0, 8);

    const saved = await saveProductModelDraft(database, draft(prefix));

    expect(saved.combinations.map((entry) => [entry.sku, entry.reviewStatus])).toEqual([
      [`${prefix}-P-38`, "draft"],
      [`${prefix}-P-39`, "draft"],
    ]);
    expect((await rowOf(`${prefix}-P-38`))?.title).toBe("Tênis Casual Couro - Preto 38");
  });

  it("names a new grid after its title, never repeating another grid's code", async () => {
    const prefix = randomUUID().slice(0, 8);
    const title = `Tênis Código ${prefix}`;
    const input = draft(prefix);

    const first = await saveProductModelDraft(database, {
      ...input,
      values: { ...input.values, title },
    });
    const second = await saveProductModelDraft(database, {
      ...draft(`${prefix}b`),
      values: { ...input.values, title },
    });

    expect(first.code).toBe(`TENIS-CODIGO-${prefix.toUpperCase()}`);
    expect(second.code).toBe(`TENIS-CODIGO-${prefix.toUpperCase()}-2`);
  });

  it("saves a grid still being typed, with a colour that has no combination yet", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);

    const saved = await saveProductModelDraft(database, {
      ...input,
      grid: { ...input.grid, colors: [...input.grid.colors, { name: "Branco", imageUrls: [] }] },
    });

    expect(saved.colors.map((color) => color.name)).toEqual(["Preto", "Branco"]);
  });

  it("answers a retried save with the stored model instead of a conflict", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    await saveProductModelDraft(database, input);

    const retried = await saveProductModelDraft(database, input);

    expect(retried.combinations).toHaveLength(2);
  });

  it("refuses a change made over a version the form never saw", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    const first = await saveProductModelDraft(database, input);
    await saveProductModelDraft(database, {
      ...input,
      values: { ...input.values, title: "Tênis Casual Outra Janela" },
      expectedUpdatedAt: first.updatedAt.toISOString(),
    });

    const stale = saveProductModelDraft(database, {
      ...input,
      values: { ...input.values, title: "Tênis Casual Janela Velha" },
      expectedUpdatedAt: first.updatedAt.toISOString(),
    });

    await expect(stale).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
  });

  it("renames a colour on every combination and deletes a combination taken out", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    const first = await saveProductModelDraft(database, input);

    const saved = await saveProductModelDraft(database, {
      ...input,
      expectedUpdatedAt: first.updatedAt.toISOString(),
      grid: {
        colors: [{ name: "Grafite", previousName: "Preto", imageUrls: [] }],
        sizes: [{ name: "38" }],
        combinations: [combination("Grafite", "38", `${prefix}-P-38`)],
      },
    });

    expect(saved.combinations.map((entry) => entry.color)).toEqual(["Grafite"]);
    expect((await rowOf(`${prefix}-P-38`))?.title).toBe("Tênis Casual Couro - Grafite 38");
    expect(await rowOf(`${prefix}-P-39`)).toBeUndefined();
  });

  it("keeps a sale's stock when the supplier left the count as it was", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    const first = await saveProductModelDraft(database, input);
    await database
      .update(supplierProducts)
      .set({ stock: 2 })
      .where(eq(supplierProducts.sku, `${prefix}-P-38`));

    await saveProductModelDraft(database, {
      ...input,
      values: { ...input.values, title: "Tênis Casual Couro Novo" },
      expectedUpdatedAt: first.updatedAt.toISOString(),
      grid: {
        ...input.grid,
        combinations: input.grid.combinations.map((entry) => ({ ...entry, expectedStock: 4 })),
      },
    });

    expect((await rowOf(`${prefix}-P-38`))?.stock).toBe(2);
  });

  it("does not restore units already sold when the form omits its stock baseline", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    const first = await saveProductModelDraft(database, input);
    const sku = `${prefix}-P-38`;
    await database.update(supplierProducts).set({ stock: 2 }).where(eq(supplierProducts.sku, sku));

    const attempt = saveProductModelDraft(database, {
      ...input,
      expectedUpdatedAt: first.updatedAt.toISOString(),
    });

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
    expect((await rowOf(sku))?.stock).toBe(2);
  });

  it("refuses a SKU another product of the supplier already has", async () => {
    const prefix = randomUUID().slice(0, 8);
    await saveProductModelDraft(database, draft(prefix));

    const attempt = saveProductModelDraft(database, draft(prefix));

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "CONFLICT"));
  });
});

describe("publishProductModel", () => {
  it("puts every combination on sale at once", async () => {
    const prefix = randomUUID().slice(0, 8);
    const { id: modelId } = await saveProductModelDraft(database, draft(prefix));

    const published = await publishProductModel(database, { supplierId, modelId });

    expect(published.combinations.map((entry) => entry.reviewStatus)).toEqual([
      "approved",
      "approved",
    ]);
  });

  it("names what each combination lacks and publishes nothing", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    const { id: modelId } = await saveProductModelDraft(database, {
      ...input,
      values: { ...input.values, fiscal: noFiscal },
    });

    const attempt = publishProductModel(database, { supplierId, modelId });

    await expect(attempt).rejects.toThrow("Preto 38: Informe NCM");
    const stored = await getProductModel(database, { supplierId, modelId });
    expect(stored?.combinations.every((entry) => entry.reviewStatus === "draft")).toBe(true);
  });

  it("asks for stock when no combination has any", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    const { id: modelId } = await saveProductModelDraft(database, {
      ...input,
      grid: {
        ...input.grid,
        combinations: input.grid.combinations.map((entry) => ({ ...entry, stock: 0 })),
      },
    });

    const attempt = publishProductModel(database, { supplierId, modelId });

    await expect(attempt).rejects.toThrow("Informe o estoque de pelo menos uma combinação");
  });

  it("refuses a grid with a colour nobody sells", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    const { id: modelId } = await saveProductModelDraft(database, {
      ...input,
      grid: { ...input.grid, colors: [...input.grid.colors, { name: "Branco", imageUrls: [] }] },
    });

    const attempt = publishProductModel(database, { supplierId, modelId });

    await expect(attempt).rejects.toThrow('A cor "Branco" não tem nenhuma combinação');
  });
});

describe("deleteUnsoldProductModel", () => {
  it("deletes a model nobody listed or sold, with its combinations", async () => {
    const prefix = randomUUID().slice(0, 8);
    const { id: modelId } = await saveProductModelDraft(database, draft(prefix));

    await deleteUnsoldProductModel(database, { supplierId, modelId });

    expect(await getProductModel(database, { supplierId, modelId })).toBeNull();
    expect(await rowOf(`${prefix}-P-38`)).toBeUndefined();
  });
});

describe("supplier panel list", () => {
  it("shows a grid once, with its options and the stock of every combination", async () => {
    const prefix = randomUUID().slice(0, 8);
    const input = draft(prefix);
    await saveProductModelDraft(database, {
      ...input,
      values: { ...input.values, title: `Lista ${prefix}` },
    });

    const list = await listSupplierPanelProducts(database, {
      supplierId,
      status: "all",
      query: `Lista ${prefix}`,
      sort: "title",
      direction: "asc",
      page: 1,
      pageSize: 25,
      fiscal: "all",
    });

    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.grid).toMatchObject({
      title: `Lista ${prefix}`,
      colors: 1,
      sizes: 2,
      combinations: 2,
      stock: 8,
    });
    expect(list.counts.all).toBe(1);
  });
});

describe("spreadsheet export", () => {
  it("exports each combination with its model's code and title, its colour and size", async () => {
    const prefix = randomUUID().slice(0, 8);
    const saved = await saveProductModelDraft(database, draft(prefix));
    const rows = [];

    for await (const batch of supplierCatalogExportBatches(
      database,
      { supplierId, status: "all", query: prefix, fiscal: "all" },
      100,
    )) {
      rows.push(...batch);
    }

    expect(rows.find((entry) => entry.sku === `${prefix}-P-38`)?.grid).toEqual({
      modelCode: saved.code,
      modelTitle: "Tênis Casual Couro",
      color: "Preto",
      size: "38",
    });
  });
});
