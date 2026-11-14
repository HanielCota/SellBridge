import { randomUUID } from "node:crypto";
import { STORE_SUPPLIER_CHANGED_MESSAGE } from "@sellbridge/shared/store-supplier";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listingTargets, supplierProducts, suppliers } from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  publishTestProduct,
  testStoreInput,
} from "../testing/fixtures.ts";
import { createListingWithTargets } from "./listings.ts";
import { setListingsPaused } from "./listing-actions.ts";
import {
  addStoreSupplier,
  assertStoresSellSupplier,
  previewStoreSupplierRemoval,
  removeStoreSupplier,
} from "./store-suppliers.ts";
import { listStoreConnections, upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
const catalogs: Awaited<ReturnType<typeof createTestSupplierProduct>>[] = [];
let storeId = "";

async function product(label: string) {
  const catalog = await createTestSupplierProduct(database, {
    sku: `LST-${label}-${randomUUID().slice(0, 8)}`,
    title: `Produto ${label}`,
    costCents: 1000,
    suggestedPriceCents: 2000,
    stock: 4,
  });
  catalogs.push(catalog);
  return catalog;
}

async function supplierIdsOfStore(): Promise<string[]> {
  const stores = await listStoreConnections(database, tenants.tenantA);
  return stores.find((store) => store.id === storeId)?.supplierIds ?? [];
}

async function statusOf(targetId: string) {
  const [row] = await database
    .select({ status: listingTargets.status, errorReason: listingTargets.errorReason })
    .from(listingTargets)
    .where(eq(listingTargets.id, targetId));
  return row;
}

let first: Awaited<ReturnType<typeof product>>;
let second: Awaited<ReturnType<typeof product>>;

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  first = await product("primeiro");
  second = await product("segundo");
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenants.tenantA, `shop-list-${tenants.tenantA}`),
    supplierId: first.supplierId,
  });
  storeId = store.id;
});

afterAll(async () => {
  await tenants.cleanup();
  for (const catalog of catalogs) {
    await catalog.cleanup();
  }
  await database.$client.end();
});

describe("a shop selling several suppliers", () => {
  it("adds a supplier and keeps the ones it already sells", async () => {
    const input = {
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      supplierId: second.supplierId,
    };

    await addStoreSupplier(database, input);
    await addStoreSupplier(database, input);

    expect(await supplierIdsOfStore()).toEqual([first.supplierId, second.supplierId]);
    await expect(
      assertStoresSellSupplier(database, tenants.tenantA, [storeId], first.supplierId),
    ).resolves.toBeUndefined();
    await expect(
      assertStoresSellSupplier(database, tenants.tenantA, [storeId], second.supplierId),
    ).resolves.toBeUndefined();
  });

  it("refuses adding a supplier to a shop of another tenant", async () => {
    const third = await product("terceiro");

    const adding = addStoreSupplier(database, {
      tenantId: tenants.tenantB,
      storeConnectionId: storeId,
      supplierId: third.supplierId,
    });

    await expect(adding).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await supplierIdsOfStore()).not.toContain(third.supplierId);
  });

  it("refuses adding an inactive supplier", async () => {
    const inactive = await product("inativo");
    await database
      .update(suppliers)
      .set({ active: false })
      .where(eq(suppliers.id, inactive.supplierId));

    const adding = addStoreSupplier(database, {
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      supplierId: inactive.supplierId,
    });

    await expect(adding).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("removes a supplier, pausing only its listings and stopping its queued ones", async () => {
    const firstLive = await publishTestProduct(database, first.productId, [
      { tenantId: tenants.tenantA, storeId },
    ]);
    const secondLive = await publishTestProduct(database, second.productId, [
      { tenantId: tenants.tenantA, storeId },
    ]);
    const [queuedProduct] = await database
      .insert(supplierProducts)
      .values({
        supplierId: second.supplierId,
        sku: `LST-fila-${randomUUID().slice(0, 8)}`,
        title: "Produto na fila",
        costCents: 1000,
        suggestedPriceCents: 2000,
        stock: 4,
      })
      .returning({ id: supplierProducts.id });
    const queued = await createListingWithTargets(
      database,
      tenants.tenantA,
      {
        supplierProductId: queuedProduct?.id ?? "",
        title: "Fila",
        description: "Fila",
        priceCents: 3000,
      },
      [storeId],
    );
    const input = {
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      supplierId: second.supplierId,
    };

    const preview = await previewStoreSupplierRemoval(database, input);
    const impact = await removeStoreSupplier(database, input);

    expect(preview).toEqual({ livePaused: 1, queuedStopped: 1 });
    expect(impact).toEqual({ livePaused: 1, queuedStopped: 1 });
    expect(await supplierIdsOfStore()).toEqual([first.supplierId]);
    expect(await statusOf(secondLive.get(tenants.tenantA) ?? "")).toMatchObject({
      status: "paused",
    });
    expect(await statusOf(queued.targetIds[0] ?? "")).toEqual({
      status: "error",
      errorReason: STORE_SUPPLIER_CHANGED_MESSAGE,
    });
    expect(await statusOf(firstLive.get(tenants.tenantA) ?? "")).toMatchObject({
      status: "published",
    });
  });

  it("keeps the removed supplier's listings paused until it is added back", async () => {
    const [paused] = await database
      .select({ listingId: listingTargets.listingId })
      .from(listingTargets)
      .where(
        and(eq(listingTargets.status, "paused"), eq(listingTargets.storeConnectionId, storeId)),
      );
    const listingIds = paused === undefined ? [] : [paused.listingId];

    const resumedBefore = await setListingsPaused(database, tenants.tenantA, listingIds, false);
    await addStoreSupplier(database, {
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      supplierId: second.supplierId,
    });
    const resumedAfter = await setListingsPaused(database, tenants.tenantA, listingIds, false);

    expect(listingIds).toHaveLength(1);
    expect(resumedBefore).toBe(0);
    expect(resumedAfter).toBe(1);
  });

  it("refuses removing a supplier the shop does not sell", async () => {
    const other = await product("nao-vendido");

    const removing = removeStoreSupplier(database, {
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      supplierId: other.supplierId,
    });

    await expect(removing).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses removing the only supplier, so the shop never turns pending", async () => {
    await removeStoreSupplier(database, {
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      supplierId: second.supplierId,
    });

    const removing = removeStoreSupplier(database, {
      tenantId: tenants.tenantA,
      storeConnectionId: storeId,
      supplierId: first.supplierId,
    });

    await expect(removing).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await supplierIdsOfStore()).toEqual([first.supplierId]);
  });

  it("refuses removing a supplier from a shop of another tenant", async () => {
    const removing = removeStoreSupplier(database, {
      tenantId: tenants.tenantB,
      storeConnectionId: storeId,
      supplierId: first.supplierId,
    });

    await expect(removing).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
