import { randomUUID } from "node:crypto";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets, supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenants,
  publishTestProduct,
  type TestSeller,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  importSupplierProducts,
  saveAdminSupplier,
  saveAdminSupplierProduct,
  setAdminSupplierActive,
  setAdminSupplierProductActive,
} from "./admin-suppliers.ts";
import { getListingOverview, setListingsPaused } from "./listing-overview.ts";
import { listNotificationEvents } from "./notifications.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let first: TestSeller;
let second: TestSeller;
let bystander: TestSeller;
const supplierIds: string[] = [];

const REVIEWABLE_SINCE = new Date("2026-01-01T00:00:00Z");

async function seller(tenantId: string): Promise<TestSeller> {
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `shop-${tenantId}`));
  return { tenantId, storeId: store.id };
}

async function newSupplier() {
  const supplier = await saveAdminSupplier(database, {
    name: `Desativação ${randomUUID()}`,
    niche: "Teste",
    description: "",
    state: "SP",
    city: "São Paulo",
    logoUrl: null,
    coverage: [{ state: "SP", city: null }],
    contactEmail: null,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
  });
  supplierIds.push(supplier.id);
  return supplier.id;
}

/** A product of `supplierId` published by both sellers; returns its id, listing and targets. */
async function publishedProduct(supplierId: string, sku = `DES-${randomUUID().slice(0, 8)}`) {
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
  const targets = await publishTestProduct(database, product.id, [first, second]);
  return { productId: product.id, sku, targets };
}

async function statusesOf(targets: Map<string, string>) {
  const rows = await database
    .select({ id: listingTargets.id, status: listingTargets.status })
    .from(listingTargets)
    .where(inArray(listingTargets.id, [...targets.values()]));
  return rows.map((row) => row.status);
}

async function listingIdOf(targetId: string) {
  const row = await database.query.listingTargets.findFirst({
    where: eq(listingTargets.id, targetId),
  });
  if (!row) {
    throw new Error("destino não encontrado");
  }
  return row.listingId;
}

/** The bell's "listing unavailable" entries of one tenant about one listing. */
async function unavailableInBell(tenantId: string, listingId: string) {
  const { events } = await listNotificationEvents(database, {
    tenantId,
    userId: `leitor-${tenantId}`,
    reviewableSince: REVIEWABLE_SINCE,
  });
  return events.flatMap((event) =>
    event.kind === "listing_unavailable" && event.entityId === listingId ? [event] : [],
  );
}

/** Every "listing unavailable" entry in a tenant's bell, whatever the listing. */
async function anyUnavailableInBell(tenantId: string) {
  const { events } = await listNotificationEvents(database, {
    tenantId,
    userId: `leitor-${tenantId}`,
    reviewableSince: REVIEWABLE_SINCE,
  });
  return events.filter((event) => event.kind === "listing_unavailable");
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 3);
  const [one, two, three] = tenants.ids;
  if (!one || !two || !three) {
    throw new Error("tenants não criados");
  }
  first = await seller(one);
  second = await seller(two);
  bystander = await seller(three);
});

afterAll(async () => {
  // Listings hold their products: the tenants (and their listings) go first.
  await tenants.cleanup();
  await database.delete(suppliers).where(inArray(suppliers.id, supplierIds));
  await database.$client.end();
});

describe("deactivating a catalog product", () => {
  it("pauses the live listings of every reseller and leaves other products alone", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const untouched = await publishedProduct(supplierId);

    const result = await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.productId,
      active: false,
    });

    expect(result.pausedTargets).toBe(2);
    expect(await statusesOf(product.targets)).toEqual(["paused", "paused"]);
    expect(await statusesOf(untouched.targets)).toEqual(["published", "published"]);
  });

  it("keeps the listings paused when the product comes back: the reseller decides", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.productId,
      active: false,
    });

    const result = await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.productId,
      active: true,
    });

    expect(result.pausedTargets).toBe(0);
    expect(await statusesOf(product.targets)).toEqual(["paused", "paused"]);
  });

  it("pauses every product of a deactivated supplier", async () => {
    const supplierId = await newSupplier();
    const one = await publishedProduct(supplierId);
    const two = await publishedProduct(supplierId);

    const result = await setAdminSupplierActive(database, supplierId, false);

    expect(result.pausedTargets).toBe(4);
    expect([...(await statusesOf(one.targets)), ...(await statusesOf(two.targets))]).toEqual([
      "paused",
      "paused",
      "paused",
      "paused",
    ]);
  });

  it("pauses the listings of a product a CSV import turns off", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const parsed = parseProductCsv(
      `sku;titulo;custo;estoque;ativo\n${product.sku};Produto;15,00;5;nao`,
    );

    const result = await importSupplierProducts(database, {
      supplierId,
      rows: parsed.rows,
      validatePreview: () => {},
    });

    expect(result.pausedTargets).toBe(2);
    expect(await statusesOf(product.targets)).toEqual(["paused", "paused"]);
  });
});

describe("what the reseller sees", () => {
  it("refuses to resume while the product is unavailable, and resumes once it is back", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const targetId = product.targets.get(first.tenantId) ?? "";
    const listingId = await listingIdOf(targetId);
    await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.productId,
      active: false,
    });

    await expect(
      setListingsPaused(database, first.tenantId, [listingId], false),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.productId,
      active: true,
    });
    expect(await setListingsPaused(database, first.tenantId, [listingId], false)).toBe(1);
  });

  it("makes a resume wait for a deactivation in progress, then refuses it", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const listingId = await listingIdOf(product.targets.get(first.tenantId) ?? "");
    await database
      .update(listingTargets)
      .set({ status: "paused" })
      .where(eq(listingTargets.listingId, listingId));

    let resume: Promise<number> | null = null;
    await database.transaction(async (transaction) => {
      await transaction
        .update(supplierProducts)
        .set({ active: false })
        .where(eq(supplierProducts.id, product.productId));
      resume = setListingsPaused(database, first.tenantId, [listingId], false);
      const outcome = await Promise.race([
        resume.then(
          () => "finished",
          () => "finished",
        ),
        new Promise((resolve) => setTimeout(() => resolve("waiting"), 300)),
      ]);
      expect(outcome).toBe("waiting");
    });

    await expect(resume).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("tells the listing card why the product stopped", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const listingId = await listingIdOf(product.targets.get(first.tenantId) ?? "");
    await setAdminSupplierActive(database, supplierId, false);

    const row = await getListingOverview(database, first.tenantId, listingId);

    expect(row.unavailable).toBe("supplier_inactive");
  });

  it("warns each affected reseller in the bell, nobody else, until the product is back", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.productId,
      active: false,
    });

    const listingOfFirst = await listingIdOf(product.targets.get(first.tenantId) ?? "");
    const listingOfSecond = await listingIdOf(product.targets.get(second.tenantId) ?? "");
    expect(await unavailableInBell(first.tenantId, listingOfFirst)).toEqual([
      expect.objectContaining({ reason: "product_inactive" }),
    ]);
    expect(await unavailableInBell(second.tenantId, listingOfSecond)).toHaveLength(1);
    expect(await anyUnavailableInBell(bystander.tenantId)).toEqual([]);

    await setAdminSupplierProductActive(database, {
      supplierId,
      productId: product.productId,
      active: true,
    });
    expect(await unavailableInBell(first.tenantId, listingOfFirst)).toEqual([]);
  });
});
