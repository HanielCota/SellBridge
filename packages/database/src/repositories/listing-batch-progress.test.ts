import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  testStoreInput,
} from "../testing/fixtures.ts";
import { getPublishBatchStatus } from "./listing-batch-progress.ts";
import { createListingWithTargets, markTargetFailed, markTargetPublished } from "./listings.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let catalog: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let targetIds: string[] = [];

async function createTarget(storeId: string, title: string): Promise<string> {
  const created = await createListingWithTargets(
    database,
    tenants.tenantA,
    { supplierProductId: catalog.productId, title, description: "Descrição", priceCents: 3000 },
    [storeId],
  );
  const [targetId] = created.targetIds;
  if (targetId === undefined) throw new Error("alvo não criado");
  return targetId;
}

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  catalog = await createTestSupplierProduct(database, {
    sku: "BATCH-1",
    title: "Produto lote",
    costCents: 1000,
    suggestedPriceCents: 3000,
  });
  const stores = await Promise.all(
    ["a", "b", "c", "d"].map((suffix) =>
      upsertStoreConnection(
        database,
        testStoreInput(tenants.tenantA, `batch-${suffix}-${tenants.tenantA}`),
      ),
    ),
  );
  targetIds = [];
  for (const [index, store] of stores.entries()) {
    targetIds.push(await createTarget(store.id, `Anúncio do lote ${index}`));
  }
  const [published, failed, retrying] = targetIds;
  if (published === undefined || failed === undefined || retrying === undefined) {
    throw new Error("alvos não criados");
  }
  await markTargetPublished(database, published, { externalId: "MOCK-BATCH-1", externalUrl: null });
  await markTargetFailed(database, failed, "Categoria recusada", { final: true });
  await markTargetFailed(database, retrying, "Tempo esgotado", { final: false });
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  await database.$client.end();
});

describe("getPublishBatchStatus", () => {
  it("counts published, failed for good and still pending jobs of the batch", async () => {
    const status = await getPublishBatchStatus(database, tenants.tenantA, targetIds);
    expect(status).toMatchObject({ total: 4, published: 1, failed: 1, pending: 2 });
  });

  it("dates the batch from its first job to its last finished one", async () => {
    const status = await getPublishBatchStatus(database, tenants.tenantA, targetIds);
    expect(status.startedAt).toBeInstanceOf(Date);
    expect(status.lastFinishedAt).toBeInstanceOf(Date);
    expect(status.lastFinishedAt?.getTime() ?? 0).toBeGreaterThanOrEqual(
      status.startedAt?.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  it("shows another tenant nothing of the batch", async () => {
    expect(await getPublishBatchStatus(database, tenants.tenantB, targetIds)).toEqual({
      total: 0,
      published: 0,
      failed: 0,
      pending: 0,
      startedAt: null,
      lastFinishedAt: null,
    });
  });

  it("answers an empty batch", async () => {
    expect((await getPublishBatchStatus(database, tenants.tenantA, [])).total).toBe(0);
  });
});
