import { randomUUID } from "node:crypto";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { planGridImport } from "@sellbridge/shared/product-grid-import";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productModels, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase } from "../testing/fixtures.ts";
import { importSupplierProducts, previewSupplierProductImport } from "./admin-suppliers.ts";
import { getProductModel } from "./product-models.ts";
import { resolveGrids } from "./supplier-grid-import.ts";

const database = createTestDatabase();
let supplierId = "";

const HEADER = "sku;titulo;custo;estoque;imagens;ncm;origem;unidade;codigo_modelo;cor;tamanho";

function rows(lines: readonly string[]) {
  return parseProductCsv([HEADER, ...lines].join("\n"), { gridColumns: true }).rows;
}

async function importRows(lines: readonly string[]) {
  return await importSupplierProducts(database, {
    supplierId,
    rows: rows(lines),
    validatePreview: () => undefined,
  });
}

async function rowOf(sku: string) {
  const [row] = await database.select().from(supplierProducts).where(eq(supplierProducts.sku, sku));
  return row;
}

beforeAll(async () => {
  const [supplier] = await database
    .insert(suppliers)
    .values({
      name: `Planilha grade ${randomUUID()}`,
      niche: "Calçados",
      state: "SP",
      city: "Franca",
    })
    .returning({ id: suppliers.id });
  supplierId = supplier?.id ?? "";
});

afterAll(async () => {
  await database.delete(suppliers).where(eq(suppliers.id, supplierId));
});

describe("grids from the product spreadsheet", () => {
  it("creates one grid from rows sharing a model code", async () => {
    const code = `TEN-${randomUUID().slice(0, 6).toUpperCase()}`;

    const result = await importRows([
      `${code}-P-38;Tênis Planilha;59,90;5;https://cdn.example.com/p.jpg;64039990;0;PAR;${code};Preto;38`,
      `${code}-P-39;Tênis Planilha;59,90;3;;;;;${code};Preto;39`,
      `${code}-B-38;Tênis Planilha;59,90;2;https://cdn.example.com/b.jpg;;;;${code};Branco;38`,
    ]);

    // One new product, as the list shows it: the grid, not its three combinations.
    expect(result.created).toBe(1);
    const [model] = await database
      .select({ id: productModels.id })
      .from(productModels)
      .where(eq(productModels.code, code));
    const detail = await getProductModel(database, { supplierId, modelId: model?.id ?? "" });
    expect(detail?.colors.map((color) => color.name)).toEqual(["Preto", "Branco"]);
    expect(detail?.sizes).toEqual(["38", "39"]);
    expect(await rowOf(`${code}-B-38`)).toMatchObject({
      title: "Tênis Planilha - Branco 38",
      imageUrls: ["https://cdn.example.com/b.jpg"],
      stock: 2,
    });
  });

  it("grows a model stored with a code in another case instead of creating a second one", async () => {
    const code = `MIX-${randomUUID().slice(0, 6).toUpperCase()}`;
    await importRows([`${code}-P-38;Tênis Caixa;59,90;5;;64039990;0;PAR;${code};Preto;38`]);
    await database
      .update(productModels)
      .set({ code: code.toLowerCase() })
      .where(eq(productModels.code, code));

    await importRows([`${code}-P-39;Tênis Caixa;59,90;3;;;;;${code};Preto;39`]);

    const models = await database
      .select({ id: productModels.id })
      .from(productModels)
      .where(eq(productModels.supplierId, supplierId));
    const grown = await rowOf(`${code}-P-39`);
    const first = await rowOf(`${code}-P-38`);
    expect(grown?.modelId).toBe(first?.modelId);
    expect(new Set(models.map((model) => model.id)).has(first?.modelId ?? "")).toBe(true);
  });

  it("keeps an old one-product-per-size catalog as separate products", async () => {
    const code = `OLD-${randomUUID().slice(0, 6)}`;
    await importRows([`${code}-P-38;Tênis Antigo - Preto 38;59,90;5;;;;;;;`]);

    const plan = await previewSupplierProductImport(
      database,
      supplierId,
      rows([
        `${code}-P-38;Tênis Antigo;59,90;5;;;;;${code};Preto;38`,
        `${code}-P-39;Tênis Antigo;59,90;5;;;;;${code};Preto;39`,
      ]),
    );

    expect(plan.grids).toEqual([]);
    expect(plan.notices).toHaveLength(1);
    expect(plan.products.map((product) => product.title)).toEqual([
      "Tênis Antigo - Preto 38",
      "Tênis Antigo - Preto 39",
    ]);
  });

  it("adds a new size to a grid the supplier already has", async () => {
    const code = `ADD-${randomUUID().slice(0, 6)}`;
    await importRows([`${code}-P-38;Tênis Mais;59,90;5;;64039990;0;PAR;${code};Preto;38`]);

    await importRows([`${code}-P-40;Tênis Mais;59,90;1;;;;;${code};Preto;40`]);

    expect(await rowOf(`${code}-P-40`)).toMatchObject({ title: "Tênis Mais - Preto 40", stock: 1 });
  });

  it("updates only the stock of a combination imported again", async () => {
    const code = `UPD-${randomUUID().slice(0, 6)}`;
    await importRows([`${code}-P-38;Tênis Estoque;59,90;5;;64039990;0;PAR;${code};Preto;38`]);

    await importRows([`${code}-P-38;Outro Nome;59,90;9;;;;;${code};Preto;38`]);

    expect(await rowOf(`${code}-P-38`)).toMatchObject({
      title: "Tênis Estoque - Preto 38",
      stock: 9,
    });
  });
});

describe("resolveGrids", () => {
  it("marks every line of a new grid whose category is unknown", () => {
    const plan = planGridImport({
      rows: rows([
        "SEM-CAT-P-38;Tênis sem categoria;59,90;4;;64039990;0;PAR;SEMCAT;Preto;38",
        "SEM-CAT-P-39;Tênis sem categoria;59,90;2;;;;;SEMCAT;Preto;39",
      ]).map((entry) => ({ ...entry, product: { ...entry.product, categorySlug: "nao-existe" } })),
      existingSkus: new Map(),
      existingModels: new Map(),
    });

    const resolved = resolveGrids(plan.grids, () => undefined);

    expect(resolved.grids).toEqual([]);
    expect(resolved.errors.map((error) => error.line)).toEqual([2, 3]);
  });
});
