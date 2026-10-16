import { randomUUID } from "node:crypto";
import { conflictError } from "@sellbridge/shared/errors";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listings, storeConnections, supplierProducts, suppliers } from "../schema/index.ts";
import { createTestDatabase, createTestTenants, testStoreInput } from "../testing/fixtures.ts";
import {
  createListingWithTargets,
  findTargetsNeedingSync,
  markTargetPublished,
  markTargetSynced,
} from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";
import {
  getSellableCatalogProduct,
  getDirectorySupplier,
  listCatalogProducts,
  listSellableCatalog,
  listActiveSuppliers,
} from "./suppliers.ts";
import {
  getAdminSupplier,
  importSupplierProducts,
  listAdminSupplierProducts,
  listSupplierSellers,
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
  contactEmail: "pedidos@fornecedor-teste.com.br",
  acceptWithinHours: 12,
  dispatchWithinHours: 36,
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
  it("saves where the supplier ships from, with no delivery area", async () => {
    await saveAdminSupplier(database, { ...supplierInput, supplierId, city: "Santos" });
    expect((await getAdminSupplier(database, supplierId)).supplier).toMatchObject({
      state: "SP",
      city: "Santos",
    });
    await saveAdminSupplier(database, { ...supplierInput, supplierId });
  });

  it("lists the shops that sell the supplier, never disconnected ones", async () => {
    const tenants = await createTestTenants(database, 1);
    const [tenantId] = tenants.ids;
    if (tenantId === undefined) {
      throw new Error("tenant não criado");
    }
    try {
      const live = await upsertStoreConnection(database, {
        ...testStoreInput(tenantId, `seller-${tenantId}`),
        supplierId,
      });
      const gone = await upsertStoreConnection(database, {
        ...testStoreInput(tenantId, `gone-${tenantId}`),
        supplierId,
      });
      await database
        .update(storeConnections)
        .set({ status: "disconnected" })
        .where(eq(storeConnections.id, gone.id));
      const sellers = await listSupplierSellers(database, supplierId);
      expect(sellers.map((seller) => seller.storeConnectionId)).toEqual([live.id]);
      expect(sellers[0]).toMatchObject({ tenantId, recentOrders: 0 });
      expect(await listSupplierSellers(database, otherSupplierId)).toEqual([]);
    } finally {
      await tenants.cleanup();
    }
  });

  it("keeps the e-mail for orders and the deadlines, away from the reseller pages", async () => {
    expect((await getAdminSupplier(database, supplierId)).supplier).toMatchObject({
      contactEmail: "pedidos@fornecedor-teste.com.br",
      acceptWithinHours: 12,
      dispatchWithinHours: 36,
    });
    await saveAdminSupplier(database, {
      ...supplierInput,
      supplierId,
      contactEmail: null,
      acceptWithinHours: 6,
    });
    expect((await getAdminSupplier(database, supplierId)).supplier).toMatchObject({
      contactEmail: null,
      acceptWithinHours: 6,
      dispatchWithinHours: 36,
    });
    await saveAdminSupplier(database, { ...supplierInput, supplierId });
    // Only the admin and the order e-mail use the contact: the reseller never sees it.
    const directory = await getDirectorySupplier(database, supplierId);
    const listed = await listActiveSuppliers(database, { search: supplierInput.name });
    for (const supplier of [directory, ...listed]) {
      expect(Object.keys(supplier)).not.toContain("contactEmail");
    }
  });

  it("gives a supplier created without deadlines one day to accept and two to dispatch", async () => {
    const [created] = await database
      .insert(suppliers)
      .values({ name: `Sem prazo ${randomUUID()}`, niche: "Teste", state: "SP", city: "Santos" })
      .returning();
    expect(created).toMatchObject({
      contactEmail: null,
      acceptWithinHours: 24,
      dispatchWithinHours: 48,
    });
    if (created) await database.delete(suppliers).where(eq(suppliers.id, created.id));
  });

  it("previews and upserts by supplier/SKU while retaining ids and suggested prices", async () => {
    const original = await saveAdminSupplierProduct(database, { supplierId, ...productValues });
    const content = "sku;titulo;custo;estoque\nADMIN-1;Atualizado;12.90;20\nADMIN-2;Novo;3,50;5";
    expect(
      await previewSupplierProductImport(database, supplierId, parseProductCsv(content).rows),
    ).toMatchObject({ created: 1, updated: 1, errors: [] });
    expect(await importRows(content)).toMatchObject({ created: 1, updated: 1, pausedTargets: 0 });
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

  it("never undoes sales that moved the count while the form was open", async () => {
    const product = await saveAdminSupplierProduct(database, {
      supplierId,
      ...productValues,
      sku: "LIVE-COUNT",
    });
    const stockOf = async () =>
      (
        await database
          .select({ stock: supplierProducts.stock })
          .from(supplierProducts)
          .where(eq(supplierProducts.id, product.id))
      )[0]?.stock;
    const edit = (stock: number, title: string) =>
      saveAdminSupplierProduct(database, {
        supplierId,
        productId: product.id,
        ...productValues,
        sku: "LIVE-COUNT",
        title,
        stock,
        expectedStock: 10,
      });
    // The form opened at 10; the supplier shipped 2 meanwhile.
    await database
      .update(supplierProducts)
      .set({ stock: 8 })
      .where(eq(supplierProducts.id, product.id));

    // Only the title changed: the live count stays.
    await edit(10, "Novo título");
    expect(await stockOf()).toBe(8);
    // A new count typed over a count that moved is refused.
    await expect(edit(15, "Outro título")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("O estoque deste produto mudou"),
    });
    expect(await stockOf()).toBe(8);
    // Reopened at the live count, the new count is saved.
    await saveAdminSupplierProduct(database, {
      supplierId,
      productId: product.id,
      ...productValues,
      sku: "LIVE-COUNT",
      stock: 15,
      expectedStock: 8,
    });
    expect(await stockOf()).toBe(15);
  });

  it("refuses a cost or suggested price above what a listing may cost", async () => {
    const { adminProductValuesSchema } = await import("@sellbridge/shared/schemas");
    const atLimit = { ...productValues, costCents: 100_000_000, suggestedPriceCents: 100_000_000 };
    expect(adminProductValuesSchema.safeParse(atLimit).success).toBe(true);
    expect(adminProductValuesSchema.safeParse({ ...atLimit, costCents: 100_000_001 }).success).toBe(
      false,
    );
    expect(
      adminProductValuesSchema.safeParse({ ...atLimit, suggestedPriceCents: 100_000_001 }).success,
    ).toBe(false);
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

  it("never undoes a sale when the admin saves a product opened before it", async () => {
    const product = await saveAdminSupplierProduct(database, {
      supplierId,
      ...productValues,
      sku: `SHELF-${randomUUID().slice(0, 8)}`,
    });
    // A shipment takes one unit off the shelf while the admin's form is open.
    await database
      .update(supplierProducts)
      .set({ stock: product.stock - 1 })
      .where(eq(supplierProducts.id, product.id));

    const renamed = await saveAdminSupplierProduct(database, {
      supplierId,
      ...productValues,
      sku: product.sku,
      title: "Título corrigido",
      productId: product.id,
      expectedStock: product.stock,
    });
    expect(renamed).toMatchObject({ title: "Título corrigido", stock: product.stock - 1 });

    await expect(
      saveAdminSupplierProduct(database, {
        supplierId,
        ...productValues,
        sku: product.sku,
        stock: 40,
        productId: product.id,
        expectedStock: product.stock,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
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
      await expect(getSellableCatalogProduct(database, product.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await setAdminSupplierActive(database, supplierId, false);
      expect(
        (await listActiveSuppliers(database, {})).some((supplier) => supplier.id === supplierId),
      ).toBe(false);
      await expect(getDirectorySupplier(database, supplierId)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
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
          await listSellableCatalog(
            database,
            tenantId,
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
