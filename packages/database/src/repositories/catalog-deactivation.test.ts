import { randomUUID } from "node:crypto";
import { EMPTY_PRODUCT_FISCAL } from "@sellbridge/shared/product-fiscal";
import { parseProductCsv } from "@sellbridge/shared/product-csv";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listings, listingTargets, supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestTenants,
  createTestUsers,
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
import { setListingsPaused } from "./listing-actions.ts";
import { getListingOverview, listListingOverview } from "./listing-overview.ts";
import {
  createListingWithTargets,
  getTargetForPublishing,
  markTargetPublished,
} from "./listings.ts";
import { listNotificationEvents, markNotificationsSeen } from "./notifications.ts";
import { upsertStoreConnection } from "./stores.ts";
import { setSupplierStoreOpen } from "./supplier-store-open.ts";

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
    contactEmail: null,
    acceptWithinHours: 24,
    dispatchWithinHours: 48,
  });
  supplierIds.push(supplier.id);
  return supplier.id;
}

/** NF-e data a new product needs to go on sale (fiscal rule of 10/11/2026). */
const ON_SALE_FISCAL = { ...EMPTY_PRODUCT_FISCAL, ncm: "61091000", origin: 0, unit: "UN" as const };

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
    fiscal: ON_SALE_FISCAL,
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

  it("tells the listing card and the bell that the supplier closed the store, until it opens", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const listingId = await listingIdOf(product.targets.get(first.tenantId) ?? "");
    const now = new Date("2026-11-05T15:00:00Z");
    await setSupplierStoreOpen(database, { supplierId, open: false, now });

    const closed = await getListingOverview(database, first.tenantId, listingId);

    expect(closed.unavailable).toBe("supplier_closed");
    expect(await unavailableInBell(first.tenantId, listingId)).toEqual([
      expect.objectContaining({ reason: "supplier_closed" }),
    ]);
    // Closing pauses nothing: the listing keeps its place and only its stock goes to zero.
    expect(await statusesOf(product.targets)).toEqual(["published", "published"]);

    await setSupplierStoreOpen(database, { supplierId, open: true, now });
    expect((await getListingOverview(database, first.tenantId, listingId)).unavailable).toBeNull();
    expect(await unavailableInBell(first.tenantId, listingId)).toEqual([]);
  });

  it("shows the closing as news to a reseller who had already seen the bell", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const listingId = await listingIdOf(product.targets.get(first.tenantId) ?? "");
    const readers = await createTestUsers(database, 1);
    const [userId] = readers.ids;
    if (userId === undefined) {
      throw new Error("usuário não criado");
    }
    try {
      await markNotificationsSeen(database, { tenantId: first.tenantId, userId });

      await setSupplierStoreOpen(database, {
        supplierId,
        open: false,
        now: new Date(Date.now() + 60_000),
      });

      const { events, seenAt } = await listNotificationEvents(database, {
        tenantId: first.tenantId,
        userId,
        reviewableSince: REVIEWABLE_SINCE,
      });
      const closing = events.find(
        (event) => event.kind === "listing_unavailable" && event.entityId === listingId,
      );
      expect(closing).toMatchObject({ reason: "supplier_closed" });
      // The bell counts as new what came after the last look: the closing must, not the publish.
      expect(seenAt).not.toBeNull();
      expect((closing?.at.getTime() ?? 0) > (seenAt?.getTime() ?? Number.MAX_SAFE_INTEGER)).toBe(
        true,
      );
    } finally {
      await readers.cleanup();
    }
  });

  it("lets a publication that finishes while the store is closed go live, at zero stock", async () => {
    const supplierId = await newSupplier();
    const product = await saveAdminSupplierProduct(database, {
      supplierId,
      sku: `PUB-${randomUUID().slice(0, 8)}`,
      title: "Produto publicando",
      description: "Descrição",
      costCents: 1500,
      suggestedPriceCents: 3990,
      stock: 5,
      categoryId: null,
      imageUrls: [],
      mercadoLivreAttributes: {},
      fiscal: ON_SALE_FISCAL,
    });
    const listing = await createListingWithTargets(
      database,
      first.tenantId,
      {
        supplierProductId: product.id,
        title: "Publicando",
        description: "Descrição",
        priceCents: 3990,
      },
      [first.storeId],
    );
    const [targetId] = listing.targetIds;
    if (targetId === undefined) {
      throw new Error("destino não criado");
    }
    await setSupplierStoreOpen(database, { supplierId, open: false, now: new Date() });

    await markTargetPublished(database, targetId, {
      externalId: `MLB-${targetId}`,
      externalUrl: null,
    });

    const [target] = await database
      .select({ status: listingTargets.status, pauseRequested: listingTargets.pauseRequested })
      .from(listingTargets)
      .where(eq(listingTargets.id, targetId));
    expect(target).toEqual({ status: "published", pauseRequested: false });
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

async function priceListing(listingId: string, priceCents: number) {
  await database.update(listings).set({ priceCents }).where(eq(listings.id, listingId));
}

async function costProduct(productId: string, costCents: number) {
  await database
    .update(supplierProducts)
    .set({ costCents })
    .where(eq(supplierProducts.id, productId));
}

describe("a supplier raising the cost past the listing price", () => {
  it("stops the sale, says why on the listing and in the bell, and resumes once the price pays", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const targetOfFirst = product.targets.get(first.tenantId) ?? "";
    const listingOfFirst = await listingIdOf(targetOfFirst);
    const listingOfSecond = await listingIdOf(product.targets.get(second.tenantId) ?? "");
    await priceListing(listingOfFirst, 3990);
    await priceListing(listingOfSecond, 9990);

    await costProduct(product.productId, 4500);

    expect((await getListingOverview(database, first.tenantId, listingOfFirst)).unavailable).toBe(
      "cost_above_price",
    );
    const publishing = await getTargetForPublishing(database, first.tenantId, targetOfFirst);
    expect(publishing.availability.priceCoversCost).toBe(false);
    expect(await unavailableInBell(first.tenantId, listingOfFirst)).toEqual([
      expect.objectContaining({ reason: "cost_above_price" }),
    ]);
    // The other reseller's price still pays the new cost: their listing keeps selling.
    expect(await unavailableInBell(second.tenantId, listingOfSecond)).toEqual([]);

    await priceListing(listingOfFirst, 5990);
    expect(
      (await getListingOverview(database, first.tenantId, listingOfFirst)).unavailable,
    ).toBeNull();
    expect(await unavailableInBell(first.tenantId, listingOfFirst)).toEqual([]);
  });

  it("moves the stopped listing from the live tab to the paused tab and back", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const listingId = await listingIdOf(product.targets.get(first.tenantId) ?? "");
    await priceListing(listingId, 3990);
    const search = product.productId;
    const page = { page: 1, pageSize: 10 };

    await costProduct(product.productId, 4500);
    const stopped = await listListingOverview(database, first.tenantId, { search }, page);
    expect(stopped.statusCounts).toMatchObject({ published: 0, paused: 1 });
    const pausedTab = await listListingOverview(
      database,
      first.tenantId,
      { search, status: "paused" },
      page,
    );
    expect(pausedTab.items.map((row) => row.listingId)).toEqual([listingId]);

    await priceListing(listingId, 5990);
    const resumed = await listListingOverview(database, first.tenantId, { search }, page);
    expect(resumed.statusCounts).toMatchObject({ published: 1, paused: 0 });
  });

  it("treats a cost equal to the price as a loss and one cent below it as a sale", async () => {
    const supplierId = await newSupplier();
    const product = await publishedProduct(supplierId);
    const listingId = await listingIdOf(product.targets.get(first.tenantId) ?? "");
    await priceListing(listingId, 3990);

    await costProduct(product.productId, 3990);
    expect((await getListingOverview(database, first.tenantId, listingId)).unavailable).toBe(
      "cost_above_price",
    );

    await costProduct(product.productId, 3989);
    expect((await getListingOverview(database, first.tenantId, listingId)).unavailable).toBeNull();
  });
});
