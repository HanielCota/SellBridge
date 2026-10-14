import { randomUUID } from "node:crypto";
import { conflictError } from "@sellbridge/shared/errors";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listings, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import {
  createListingWithTargets,
  findTargetsNeedingSync,
  markTargetPublished,
  markTargetSynced,
} from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  getCatalogProductForRegion,
  getSupplierForRegion,
  listCatalogProducts,
  listRegionCatalog,
  listSuppliersForRegion,
} from "./suppliers.ts";
import {
  getAdminSupplier,
  importSupplierProducts,
  listAdminSupplierProducts,
  previewSupplierProductImport,
  saveAdminSupplier,
  saveAdminSupplierProduct,
  setAdminSupplierActive,
  setAdminSupplierProductActive,
} from "./admin-suppliers.ts";

const database = createTestDatabase();
let supplierId = "";
let otherSupplierId = "";
const supplierInput = {
  name: `Admin teste ${randomUUID()}`,
  niche: "Teste",
  description: "Descrição",
  state: "SP" as const,
  city: "São Paulo",
  logoUrl: null,
  coverage: [{ state: "SP" as const, city: null }],
};
const productValues = {
  sku: "ADMIN-1",
  title: "Produto",
  description: "Descrição",
  costCents: 1290,
  stock: 10,
  suggestedPriceCents: 1990,
  categoryId: null,
  imageUrls: [],
  mercadoLivreAttributes: { BRAND: "Acme", MODEL: "A1" },
};

beforeAll(async () => {
  supplierId = (await saveAdminSupplier(database, supplierInput)).id;
  otherSupplierId = (
    await saveAdminSupplier(database, { ...supplierInput, name: "Outro teste admin" })
  ).id;
});
afterAll(async () => {
  await database.delete(suppliers).where(inArray(suppliers.id, [supplierId, otherSupplierId]));
  await database.$client.end();
});

async function importRows(content: string, targetSupplierId = supplierId) {
  return await importSupplierProducts(database, {
    supplierId: targetSupplierId,
    rows: parseProductCsv(content).rows,
    validatePreview: () => undefined,
  });
}

describe("admin suppliers", () => {
  it("replaces coverage atomically and rolls back invalid coverage", async () => {
    await saveAdminSupplier(database, {
      ...supplierInput,
      supplierId,
      coverage: [{ state: "SP", city: "Santos" }],
    });
    expect((await getAdminSupplier(database, supplierId)).coverage).toEqual([
      { state: "SP", city: "Santos" },
    ]);
    await expect(
      saveAdminSupplier(database, {
        ...supplierInput,
        supplierId,
        name: "Não deve persistir",
        coverage: [
          { state: "SP", city: null },
          { state: "SP", city: null },
        ],
      }),
    ).rejects.toThrow(/Failed query/);
    expect((await getAdminSupplier(database, supplierId)).supplier.name).toBe(supplierInput.name);
    await saveAdminSupplier(database, { ...supplierInput, supplierId });
  });

  it("previews and upserts by supplier/SKU while retaining ids and suggested prices", async () => {
    const original = await saveAdminSupplierProduct(database, { supplierId, ...productValues });
    const content = "sku;titulo;custo;estoque\nADMIN-1;Atualizado;12.90;20\nADMIN-2;Novo;3,50;5";
    expect(
      await previewSupplierProductImport(database, supplierId, parseProductCsv(content).rows),
    ).toMatchObject({ created: 1, updated: 1, errors: [] });
    expect(await importRows(content)).toEqual({ created: 1, updated: 1 });
    const result = await listAdminSupplierProducts(database, supplierId, "ADMIN-1", {
      page: 1,
      pageSize: 20,
    });
    expect(result.items[0]).toMatchObject({
      id: original.id,
      title: "Atualizado",
      stock: 20,
      costCents: 1290,
      suggestedPriceCents: 1990,
      mercadoLivreAttributes: productValues.mercadoLivreAttributes,
    });
    await importRows(content, otherSupplierId);
    const other = await listAdminSupplierProducts(database, otherSupplierId, "ADMIN-1", {
      page: 1,
      pageSize: 20,
    });
    expect(other.items[0]?.id).not.toBe(original.id);
  });

  it("rejects duplicate SKUs on manual save and products belonging to another supplier", async () => {
    await expect(
      saveAdminSupplierProduct(database, { supplierId, ...productValues }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [product] = await database
      .select()
      .from(supplierProducts)
      .where(and(eq(supplierProducts.supplierId, supplierId), eq(supplierProducts.sku, "ADMIN-1")));
    if (!product) {
      throw new Error("produto de teste ausente");
    }
    await expect(
      saveAdminSupplierProduct(database, {
        supplierId: otherSupplierId,
        productId: product.id,
        ...productValues,
        sku: "MISSING",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      setAdminSupplierProductActive(database, {
        supplierId: otherSupplierId,
        productId: product.id,
        active: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not apply any row when a category is unknown or confirmation is stale", async () => {
    const rows = parseProductCsv(
      "sku;titulo;custo;estoque;categoria\nBLOCKED;Novo;1;1;missing-category",
    ).rows;
    const plan = await previewSupplierProductImport(database, supplierId, rows);
    expect(plan.errors).toEqual([{ line: 2, reason: "Categoria desconhecida: missing-category" }]);
    await expect(
      importSupplierProducts(database, { supplierId, rows, validatePreview: () => undefined }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      importSupplierProducts(database, {
        supplierId,
        rows: parseProductCsv("sku;titulo;custo;estoque\nBLOCKED;Novo;1;1").rows,
        validatePreview: () => {
          throw conflictError("Prévia desatualizada");
        },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await listAdminSupplierProducts(database, supplierId, "BLOCKED", { page: 1, pageSize: 20 }))
        .total,
    ).toBe(0);
  });

  it("rolls back a failing bulk upsert completely", async () => {
    const rows = parseProductCsv(
      "sku;titulo;custo;estoque\nADMIN-1;Não deve persistir;99;1\nROLLBACK;Novo;1;1",
    ).rows;
    const duplicated = rows[1];
    if (!duplicated) {
      throw new Error("linha de teste ausente");
    }
    await expect(
      importSupplierProducts(database, {
        supplierId,
        rows: [...rows, duplicated],
        validatePreview: () => undefined,
      }),
    ).rejects.toThrow(/Failed query/);
    const products = await listAdminSupplierProducts(database, supplierId, undefined, {
      page: 1,
      pageSize: 20,
    });
    expect(products.items.find((product) => product.sku === "ADMIN-1")?.title).toBe("Atualizado");
    expect(products.items.some((product) => product.sku === "ROLLBACK")).toBe(false);
  });

  it("preserves an inactive product when the CSV omits its active flag", async () => {
    const product = await saveAdminSupplierProduct(database, {
      supplierId,
      ...productValues,
      sku: "INACTIVE",
    });
    await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.id,
      active: false,
    });
    await importRows("sku;titulo;custo;estoque\nINACTIVE;Atualizado;12,90;5");
    const imported = await listAdminSupplierProducts(database, supplierId, "INACTIVE", {
      page: 1,
      pageSize: 20,
    });
    expect(imported.items[0]).toMatchObject({ id: product.id, active: false, stock: 5 });
  });

  it("hides inactive suppliers/products, keeps published listings and syncs zero stock", async () => {
    const tenants = await createTestTenants(database, 1);
    const [tenantId] = tenants.ids;
    if (!tenantId) {
      throw new Error("tenant de teste ausente");
    }
    const product = await saveAdminSupplierProduct(database, {
      supplierId,
      ...productValues,
      sku: "LIVE",
    });
    try {
      const store = await upsertStoreConnection(
        database,
        testStoreInput(tenantId, "admin-sync-test"),
      );
      const listing = await createListingWithTargets(
        database,
        tenantId,
        {
          supplierProductId: product.id,
          title: "Publicado",
          description: "Descrição",
          priceCents: 1990,
        },
        [store.id],
      );
      const [targetId] = listing.targetIds;
      if (!targetId) {
        throw new Error("destino de teste ausente");
      }
      await markTargetPublished(database, targetId, {
        externalId: "ADMIN-LIVE",
        externalUrl: "https://example.com/live",
      });
      await markTargetSynced(database, targetId, { stock: 10, priceCents: 1990 });
      await setAdminSupplierProductActive(database, {
        supplierId,
        productId: product.id,
        active: false,
      });
      await expect(
        getCatalogProductForRegion(database, { state: "SP", city: "Santos" }, product.id),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await setAdminSupplierActive(database, supplierId, false);
      expect(
        (await listSuppliersForRegion(database, { state: "SP", city: "Santos" }, {})).some(
          (supplier) => supplier.id === supplierId,
        ),
      ).toBe(false);
      await expect(
        getSupplierForRegion(database, { state: "SP", city: "Santos" }, supplierId),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(
        (
          await listCatalogProducts(
            database,
            supplierId,
            { sort: "title" },
            { page: 1, pageSize: 20 },
          )
        ).total,
      ).toBe(0);
      expect(
        (
          await listRegionCatalog(
            database,
            { tenantId, region: { state: "SP", city: "Santos" } },
            { supplierId, sort: "title" },
            { page: 1, pageSize: 20 },
          )
        ).total,
      ).toBe(0);
      await importRows("sku;titulo;custo;estoque;ativo\nLIVE;Atualizado;15,90;30;nao");
      expect(
        (await findTargetsNeedingSync(database, 10_000)).find(
          (target) => target.targetId === targetId,
        ),
      ).toMatchObject({ stock: 0, priceCents: 1990 });
      expect(
        await database.select().from(listings).where(eq(listings.id, listing.listingId)),
      ).toHaveLength(1);
    } finally {
      await tenants.cleanup();
      await setAdminSupplierActive(database, supplierId, true);
    }
  });
});
