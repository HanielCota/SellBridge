import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { categories, organization, supplierProducts } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
} from "../testing/fixtures.ts";
import { listAdminSupplierOptions } from "./admin-supplier-options.ts";
import { getAdminSupplier, listAdminSuppliers } from "./admin-suppliers.ts";
import { ensureSellerCatalog, findSellerCatalog, getSellerProduct } from "./seller-catalog.ts";
import { assertActiveSupplier } from "./store-suppliers.ts";
import { getProductForReview } from "./supplier-product-review-queue.ts";
import {
  getDirectorySupplier,
  getSellableCatalogProduct,
  getSellableProducts,
  listActiveSuppliers,
  listCatalogProducts,
  listSellableCatalog,
  listSellableCategories,
  listSupplierCategories,
  listSupplierDirectory,
} from "./suppliers.ts";

const database = createTestDatabase();
const PAGE = { page: 1, pageSize: 100 };
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let publicProduct: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let ownSource: Awaited<ReturnType<typeof ensureSellerCatalog>>;
let ownProductId = "";
let otherProductId = "";
let privateCategoryId = "";
let privateCategorySlug = "";
let createdSourceIds: string[] = [];
const slugs = (rows: { slug: string }[]) => rows.map((row) => row.slug);

function tenant(index: number): string {
  const id = tenants.ids[index];
  if (id === undefined) throw new Error("Missing validation tenant");
  return id;
}

async function expectNotFound(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(hasErrorCode(error, "NOT_FOUND")).toBe(true);
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 4);
  publicProduct = await createTestSupplierProduct(database, {
    sku: randomUUID(),
    title: "Public supplier product",
    costCents: 1000,
    suggestedPriceCents: 2000,
  });
  const sources = await Promise.all(
    Array.from({ length: 5 }, () => ensureSellerCatalog(database, tenant(0))),
  );
  createdSourceIds = sources.map((source) => source.id);
  const firstSource = sources[0];
  if (firstSource === undefined) throw new Error("Missing seller catalog");
  ownSource = firstSource;
  const otherSource = await ensureSellerCatalog(database, tenant(1));
  privateCategoryId = randomUUID();
  privateCategorySlug = `private-category-${randomUUID()}`;
  await database.insert(categories).values({
    id: privateCategoryId,
    name: "Private inventory category",
    slug: privateCategorySlug,
  });
  ownProductId = randomUUID();
  otherProductId = randomUUID();
  await database.insert(supplierProducts).values([
    {
      id: ownProductId,
      supplierId: ownSource.id,
      sku: "PRIVATE-SKU",
      title: "First seller private product",
      costCents: 900,
      suggestedPriceCents: 2500,
      stock: 10,
      categoryId: privateCategoryId,
    },
    {
      id: otherProductId,
      supplierId: otherSource.id,
      sku: "PRIVATE-SKU",
      title: "Second seller private product",
      costCents: 700,
      suggestedPriceCents: 2000,
      stock: 8,
    },
  ]);
});

afterAll(async () => {
  await tenants.cleanup();
  await publicProduct.cleanup();
  await database.delete(categories).where(eq(categories.id, privateCategoryId));
});

describe("private seller inventory sources", () => {
  it("creates exactly one source per seller without changing their profile kind", async () => {
    expect(new Set(createdSourceIds).size).toBe(1);
    expect(await findSellerCatalog(database, tenant(0))).toMatchObject({
      id: ownSource.id,
      catalogKind: "seller",
      ownerTenantId: tenant(0),
      organizationId: null,
    });
    expect(await findSellerCatalog(database, tenant(2))).toBeNull();
    const [owner] = await database
      .select()
      .from(organization)
      .where(eq(organization.id, tenant(0)));
    expect(owner?.kind).toBe("seller");
  });

  it("refuses missing accounts and supplier profiles", async () => {
    await expectNotFound(ensureSellerCatalog(database, randomUUID()));
    await database
      .update(organization)
      .set({ kind: "supplier" })
      .where(eq(organization.id, tenant(3)));
    await expectNotFound(ensureSellerCatalog(database, tenant(3)));
    expect(await findSellerCatalog(database, tenant(3))).toBeNull();
  });

  it("keeps private sources out of public and legacy admin supplier screens", async () => {
    for (const rows of [
      await listActiveSuppliers(database, {}),
      await listSupplierDirectory(database, {}),
      await listAdminSupplierOptions(database),
    ]) {
      expect(rows.some((row) => row.id === ownSource.id)).toBe(false);
      expect(rows.some((row) => row.id === publicProduct.supplierId)).toBe(true);
    }
    const admin = await listAdminSuppliers(database, ownSource.name, PAGE);
    expect(admin.items.some((row) => row.id === ownSource.id)).toBe(false);
    await expectNotFound(getDirectorySupplier(database, ownSource.id));
    await expectNotFound(getAdminSupplier(database, ownSource.id));
    await expectNotFound(assertActiveSupplier(database, ownSource.id));
    expect(
      (await listCatalogProducts(database, ownSource.id, { sort: "title" }, PAGE)).items,
    ).toEqual([]);
    expect(await listSupplierCategories(database, ownSource.id)).toEqual([]);
  });

  it("authorizes direct product reads by owner and hides them from supplier review", async () => {
    expect(await getSellerProduct(database, tenant(0), ownProductId)).toMatchObject({
      id: ownProductId,
    });
    await expectNotFound(getSellerProduct(database, tenant(1), ownProductId));
    await expectNotFound(getSellerProduct(database, tenant(0), publicProduct.productId));
    await expectNotFound(getProductForReview(database, ownProductId));
    await expectNotFound(getSellableCatalogProduct(database, ownProductId));
    await expectNotFound(getSellableCatalogProduct(database, ownProductId, tenant(1)));
    expect(await getSellableCatalogProduct(database, ownProductId, tenant(0))).toMatchObject({
      id: ownProductId,
    });
  });

  it("includes only the owner's private products in tenant catalog reads and batches", async () => {
    const ids = [ownProductId, otherProductId, publicProduct.productId];
    const own = await getSellableProducts(database, tenant(0), ids);
    expect(new Set(own.map((product) => product.id))).toEqual(
      new Set([ownProductId, publicProduct.productId]),
    );
    const other = await getSellableProducts(database, tenant(1), ids);
    expect(new Set(other.map((product) => product.id))).toEqual(
      new Set([otherProductId, publicProduct.productId]),
    );
    const filtered = await listSellableCatalog(
      database,
      tenant(1),
      { supplierId: ownSource.id, sort: "title" },
      PAGE,
    );
    expect(filtered.items).toEqual([]);
    const ownFiltered = await listSellableCatalog(
      database,
      tenant(0),
      { supplierId: ownSource.id, sort: "title" },
      PAGE,
    );
    expect(ownFiltered.items.map((product) => product.id)).toEqual([ownProductId]);
  });

  it("does not reveal a private product's category through global category queries", async () => {
    expect(slugs(await listSellableCategories(database))).not.toContain(privateCategorySlug);
    expect(slugs(await listSellableCategories(database, tenant(1)))).not.toContain(
      privateCategorySlug,
    );
    expect(slugs(await listSellableCategories(database, tenant(0)))).toContain(privateCategorySlug);
  });
});
