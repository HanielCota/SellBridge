import { randomUUID } from "node:crypto";
import { hasErrorCode } from "@sellbridge/shared/errors";
import type { CatalogListSearch } from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenants,
  publishTestProduct,
  type TestSeller,
  testStoreInput,
} from "../testing/fixtures.ts";
import { saveAdminSupplier, saveAdminSupplierProduct } from "./admin-suppliers.ts";
import { upsertStoreConnection } from "./stores.ts";
import { listSupplierPanelProducts } from "./supplier-panel-catalog.ts";
import { deleteUnsoldSupplierPanelProduct } from "./supplier-panel-catalog-writes.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let reseller: TestSeller;
const supplierIds: string[] = [];
const LIST: CatalogListSearch = {
  status: "all",
  query: undefined,
  sort: "updatedAt",
  direction: "desc",
  fiscal: "all",
  page: 1,
  pageSize: 25,
};

async function newSupplier() {
  const supplier = await saveAdminSupplier(database, {
    name: `Exclusão ${randomUUID()}`,
    niche: "Teste",
    description: "",
    state: "SP",
    city: "São Paulo",
    logoUrl: null,
    contactEmail: null,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
  });
  supplierIds.push(supplier.id);
  return supplier.id;
}

async function newProduct(supplierId: string) {
  const sku = `EXC-${randomUUID().slice(0, 8)}`;
  const product = await saveAdminSupplierProduct(database, {
    supplierId,
    sku,
    title: `Produto ${sku}`,
    description: "Descrição",
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 5,
    categoryId: null,
    imageUrls: [],
    mercadoLivreAttributes: {},
  });
  return product.id;
}

async function stillThere(productId: string): Promise<boolean> {
  const rows = await database
    .select({ id: supplierProducts.id })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, productId));
  return rows.length === 1;
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  const [tenantId] = tenants.ids;
  if (tenantId === undefined) {
    throw new Error("tenant não criado");
  }
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `shop-${tenantId}`));
  reseller = { tenantId, storeId: store.id };
});

afterAll(async () => {
  // Listings hold their products: the tenant (and its listings) goes first.
  await tenants.cleanup();
  await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  await database.$client.end();
});

describe("deleteUnsoldSupplierPanelProduct", () => {
  it("deletes a product nobody published or sold, and the list offered it", async () => {
    const supplierId = await newSupplier();
    const productId = await newProduct(supplierId);
    const before = await listSupplierPanelProducts(database, { ...LIST, supplierId });

    await deleteUnsoldSupplierPanelProduct(database, { supplierId, productId });

    expect(before.items.find((item) => item.id === productId)?.deletable).toBe(true);
    expect(await stillThere(productId)).toBe(false);
  });

  it("refuses a product a reseller published, and the list does not offer it", async () => {
    const supplierId = await newSupplier();
    const productId = await newProduct(supplierId);
    await publishTestProduct(database, productId, [reseller]);
    const list = await listSupplierPanelProducts(database, { ...LIST, supplierId });

    const error = await errorOf(
      deleteUnsoldSupplierPanelProduct(database, { supplierId, productId }),
    );

    expect(list.items.find((item) => item.id === productId)?.deletable).toBe(false);
    expect(hasErrorCode(error, "CONFLICT")).toBe(true);
    expect(await stillThere(productId)).toBe(true);
  });

  it("treats another supplier's product as not found and keeps it", async () => {
    const owner = await newSupplier();
    const intruder = await newSupplier();
    const productId = await newProduct(owner);

    const error = await errorOf(
      deleteUnsoldSupplierPanelProduct(database, { supplierId: intruder, productId }),
    );

    expect(hasErrorCode(error, "NOT_FOUND")).toBe(true);
    expect(await stillThere(productId)).toBe(true);
  });
});
