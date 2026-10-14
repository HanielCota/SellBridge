import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supplierCoverage, supplierProducts, suppliers, tenantProfile } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenants,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  createListingWithTargets,
  findTargetsNeedingSync,
  markTargetPublished,
  markTargetSynced,
} from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenants>>;
const cleanups: (() => Promise<void>)[] = [];

interface Seller {
  tenantId: string;
  storeId: string;
}

let mineiro: Seller;
let paulista: Seller;
let semRegiao: Seller;

async function seller(tenantId: string, region: { state: string; city: string } | null) {
  if (region) {
    await database.insert(tenantProfile).values({ tenantId, cep: "30140071", ...region });
  }
  const store = await upsertStoreConnection(database, testStoreInput(tenantId, `shop-${tenantId}`));
  return { tenantId, storeId: store.id };
}

/** A product with 5 units whose supplier covers `coverage`, published by every seller given. */
async function publishedBy(
  coverage: { state: string; city: string | null }[],
  sellers: readonly Seller[],
) {
  const sku = `AV-${randomUUID().slice(0, 8)}`;
  const catalog = await createTestSupplierProduct(database, {
    sku,
    title: `Produto ${sku}`,
    costCents: 1500,
    suggestedPriceCents: 3990,
    stock: 5,
  });
  cleanups.push(catalog.cleanup);
  if (coverage.length > 0) {
    await database
      .insert(supplierCoverage)
      .values(coverage.map((region) => ({ supplierId: catalog.supplierId, ...region })));
  }
  const targets = new Map<string, string>();
  for (const { tenantId, storeId } of sellers) {
    const created = await createListingWithTargets(
      database,
      tenantId,
      {
        supplierProductId: catalog.productId,
        title: `Anúncio ${sku}`,
        description: "Descrição",
        priceCents: 3990,
      },
      [storeId],
    );
    const [targetId] = created.targetIds;
    if (!targetId) {
      throw new Error("destino não criado");
    }
    await markTargetPublished(database, targetId, {
      externalId: `EXT-${sku}-${tenantId}`,
      externalUrl: null,
    });
    targets.set(tenantId, targetId);
  }
  return { ...catalog, sku, targets };
}

/** Stock the sync job would send to each target of the product (undefined = not queued). */
async function stockQueued(product: { targets: Map<string, string> }) {
  const queue = await findTargetsNeedingSync(database, 100_000);
  const byTarget = new Map(queue.map((target) => [target.targetId, target.stock]));
  return Object.fromEntries(
    [...product.targets].map(([tenantId, targetId]) => [tenantId, byTarget.get(targetId)]),
  );
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 3);
  const [first, second, third] = tenants.ids;
  if (!first || !second || !third) {
    throw new Error("tenants não criados");
  }
  mineiro = await seller(first, { state: "MG", city: "Belo Horizonte" });
  paulista = await seller(second, { state: "SP", city: "Campinas" });
  semRegiao = await seller(third, null);
});

afterAll(async () => {
  // Listings hold their products: the tenants (and their listings) go first.
  await tenants.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
  await database.$client.end();
});

describe("sync of products the reseller can no longer sell", () => {
  it("sends zero only to the reseller outside the supplier's coverage", async () => {
    const product = await publishedBy([{ state: "MG", city: null }], [mineiro, paulista]);

    expect(await stockQueued(product)).toEqual({
      [mineiro.tenantId]: 5,
      [paulista.tenantId]: 0,
    });
  });

  it("matches a city coverage regardless of letter case", async () => {
    const product = await publishedBy([{ state: "SP", city: "campinas" }], [paulista]);

    expect(await stockQueued(product)).toEqual({ [paulista.tenantId]: 5 });
  });

  it("sends zero for an inactive product", async () => {
    const product = await publishedBy([{ state: "MG", city: null }], [mineiro]);
    await database
      .update(supplierProducts)
      .set({ active: false })
      .where(eq(supplierProducts.id, product.productId));

    expect(await stockQueued(product)).toEqual({ [mineiro.tenantId]: 0 });
  });

  it("sends zero for every product of an inactive supplier", async () => {
    const product = await publishedBy([{ state: "MG", city: null }], [mineiro]);
    await database
      .update(suppliers)
      .set({ active: false })
      .where(eq(suppliers.id, product.supplierId));

    expect(await stockQueued(product)).toEqual({ [mineiro.tenantId]: 0 });
  });

  it("leaves the queue once the zero reached the marketplace", async () => {
    const product = await publishedBy([{ state: "MG", city: null }], [paulista]);
    const targetId = product.targets.get(paulista.tenantId);
    if (!targetId) {
      throw new Error("destino não criado");
    }
    await markTargetSynced(database, targetId, { stock: 0, priceCents: 3990 });

    expect(await stockQueued(product)).toEqual({ [paulista.tenantId]: undefined });
  });

  it("keeps offering stock to a reseller without a registered region", async () => {
    const product = await publishedBy([{ state: "MG", city: null }], [semRegiao]);

    expect(await stockQueued(product)).toEqual({ [semRegiao.tenantId]: 5 });
  });
});
