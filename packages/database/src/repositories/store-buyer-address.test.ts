import { randomUUID } from "node:crypto";
import type { AccountAddress } from "@sellbridge/shared/buyer-address";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  member,
  notificationDeliveries,
  storeBuyerAddressChecks,
  storeConnections,
  storeSuppliers,
} from "../schema/index.ts";
import {
  createTestDatabase,
  createTestSupplierProduct,
  createTestTenantPair,
  createTestUsers,
  testStoreInput,
} from "../testing/fixtures.ts";
import {
  checkStoreBuyerAddress,
  findHeldStoresForBell,
  findStoresDueForBuyerAddressCheck,
  findStoresHeldByBuyerAddress,
  findStoreSupplierPlaces,
  listBuyerAddressChecks,
} from "./store-buyer-address.ts";
import { upsertStoreConnection } from "./stores.ts";

const database = createTestDatabase();
let tenants: Awaited<ReturnType<typeof createTestTenantPair>>;
let supplier: Awaited<ReturnType<typeof createTestSupplierProduct>>;
let owner = "";
const cleanups: (() => Promise<void>)[] = [];

const WAREHOUSE = { cep: "30130110", street: "Avenida Afonso Pena", number: "1500" };

const atWarehouse: AccountAddress = {
  zipCode: "30130-110",
  street: "Av. Afonso Pena",
  number: "1500",
  types: ["buying"],
};
const atHome: AccountAddress = {
  zipCode: "01310100",
  street: "Rua Augusta",
  number: "200",
  types: ["buying"],
};

beforeAll(async () => {
  tenants = await createTestTenantPair(database);
  const users = await createTestUsers(database, 1);
  owner = users.ids[0] ?? "";
  cleanups.push(users.cleanup);
  await database.insert(member).values({
    id: randomUUID(),
    organizationId: tenants.tenantA,
    userId: owner,
    role: "owner",
    createdAt: new Date(),
  });
  supplier = await createTestSupplierProduct(database, {
    sku: `ADDRESS-${randomUUID()}`,
    title: "Fone",
    costCents: 1000,
    suggestedPriceCents: 2500,
  });
  // Only the address matters here; the rest of the NF-e profile is left out on purpose.
  await database.execute(
    sql`update suppliers set fiscal_profile = ${JSON.stringify({ address: WAREHOUSE })}::jsonb
      where id = ${supplier.supplierId}`,
  );
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  for (const cleanup of cleanups) {
    await cleanup();
  }
});

async function createStore(input: { linkSupplier: boolean; marketplace?: "mercado_livre" }) {
  const store = await upsertStoreConnection(database, {
    ...testStoreInput(tenants.tenantA, `address-${randomUUID()}`),
    ...(input.marketplace === undefined ? {} : { marketplace: input.marketplace }),
  });
  if (input.linkSupplier) {
    await database
      .insert(storeSuppliers)
      .values({ storeConnectionId: store.id, supplierId: supplier.supplierId });
  }
  return store.id;
}

async function check(storeConnectionId: string, read: () => Promise<readonly AccountAddress[]>) {
  return checkStoreBuyerAddress(database, {
    storeConnectionId,
    readAddresses: read,
    now: new Date(),
  });
}

/** One notice per moment, whatever the number of people and channels it reaches. */
async function noticesFor(storeConnectionId: string) {
  return database
    .selectDistinct({ dedupeKey: notificationDeliveries.dedupeKey })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.event, "store_buyer_address"),
        sql`${notificationDeliveries.dedupeKey} like ${`store:${storeConnectionId}:%`}`,
      ),
    );
}

describe("findStoreSupplierPlaces", () => {
  it("reads where each linked supplier ships from", async () => {
    const storeId = await createStore({ linkSupplier: true });

    const places = await findStoreSupplierPlaces(database, storeId);

    expect(places).toEqual([
      {
        supplierId: supplier.supplierId,
        zipCode: WAREHOUSE.cep,
        street: WAREHOUSE.street,
        number: WAREHOUSE.number,
      },
    ]);
  });
});

describe("checkStoreBuyerAddress", () => {
  it("holds the store back and notifies the workspace once when it buys at the supplier", async () => {
    const storeId = await createStore({ linkSupplier: true });

    const first = await check(storeId, async () => [atWarehouse]);
    const second = await check(storeId, async () => [atWarehouse]);

    expect(first).toBe("supplier_address");
    expect(second).toBe("supplier_address");
    expect(await noticesFor(storeId)).toHaveLength(1);
    const held = await findStoresHeldByBuyerAddress(database, tenants.tenantA, [storeId]);
    expect(held.map((store) => store.id)).toEqual([storeId]);
  });

  it("frees the store once the reseller fixed the address, and notifies again if it goes back", async () => {
    const storeId = await createStore({ linkSupplier: true });
    await check(storeId, async () => [atWarehouse]);

    const fixed = await check(storeId, async () => [atHome]);
    const heldAfterFix = await findStoresHeldByBuyerAddress(database, tenants.tenantA, [storeId]);
    await check(storeId, async () => [atWarehouse]);

    expect(fixed).toBe("ok");
    expect(heldAfterFix).toEqual([]);
    expect(await noticesFor(storeId)).toHaveLength(2);
  });

  it("keeps the last verdict when the marketplace cannot be read", async () => {
    const storeId = await createStore({ linkSupplier: true });
    await check(storeId, async () => [atWarehouse]);

    const result = await check(storeId, async () => {
      throw new Error("Mercado Livre fora do ar");
    });

    expect(result).toBe("supplier_address");
    const held = await findStoresHeldByBuyerAddress(database, tenants.tenantA, [storeId]);
    expect(held).toHaveLength(1);
  });

  it("marks a store never checked as not checked when the marketplace cannot be read", async () => {
    const storeId = await createStore({ linkSupplier: true });

    const result = await check(storeId, async () => {
      throw new Error("Mercado Livre fora do ar");
    });

    expect(result).toBe("not_checked");
    expect(await findStoresHeldByBuyerAddress(database, tenants.tenantA, [storeId])).toEqual([]);
  });

  it("stores only the verdict and the supplier, never the address", async () => {
    const storeId = await createStore({ linkSupplier: true });

    await check(storeId, async () => [atWarehouse]);
    const [row] = await database
      .select()
      .from(storeBuyerAddressChecks)
      .where(eq(storeBuyerAddressChecks.storeConnectionId, storeId));

    expect(Object.keys(row ?? {}).toSorted()).toEqual([
      "checkedAt",
      "result",
      "storeConnectionId",
      "supplierId",
      "wrongSince",
    ]);
    expect(JSON.stringify(row)).not.toContain("Afonso");
  });

  it("shows the supplier's name on the tenant's list", async () => {
    const storeId = await createStore({ linkSupplier: true });
    await check(storeId, async () => [atWarehouse]);

    const checks = await listBuyerAddressChecks(database, tenants.tenantA);

    expect(checks.get(storeId)).toMatchObject({
      result: "supplier_address",
      supplierName: expect.stringContaining("Fornecedor de teste"),
    });
    const otherTenant = await listBuyerAddressChecks(database, tenants.tenantB);
    expect(otherTenant.has(storeId)).toBe(false);
  });
});

describe("findStoresHeldByBuyerAddress", () => {
  it("never lists another tenant's store", async () => {
    const storeId = await createStore({ linkSupplier: true });
    await check(storeId, async () => [atWarehouse]);

    const held = await findStoresHeldByBuyerAddress(database, tenants.tenantB, [storeId]);

    expect(held).toEqual([]);
  });
});

describe("findStoresDueForBuyerAddressCheck", () => {
  it("lists connected Mercado Livre stores never checked or checked a day ago", async () => {
    const neverChecked = await createStore({ linkSupplier: false, marketplace: "mercado_livre" });
    const checkedToday = await createStore({ linkSupplier: false, marketplace: "mercado_livre" });
    const checkedYesterday = await createStore({
      linkSupplier: false,
      marketplace: "mercado_livre",
    });
    const disconnected = await createStore({ linkSupplier: false, marketplace: "mercado_livre" });
    const otherMarketplace = await createStore({ linkSupplier: false });
    const now = new Date();
    await database.insert(storeBuyerAddressChecks).values([
      { storeConnectionId: checkedToday, result: "ok", checkedAt: now },
      {
        storeConnectionId: checkedYesterday,
        result: "ok",
        checkedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      },
    ]);
    await database
      .update(storeConnections)
      .set({ status: "disconnected" })
      .where(eq(storeConnections.id, disconnected));

    const due = await findStoresDueForBuyerAddressCheck(database, { now, limit: 500 });

    const ids = new Set(due.map((store) => store.id));
    expect(ids.has(neverChecked)).toBe(true);
    expect(ids.has(checkedYesterday)).toBe(true);
    expect(ids.has(checkedToday)).toBe(false);
    expect(ids.has(disconnected)).toBe(false);
    expect(ids.has(otherMarketplace)).toBe(false);
  });
});

describe("findHeldStoresForBell", () => {
  it("lists a held store from the moment it turned wrong, and drops it once fixed", async () => {
    const storeId = await createStore({ linkSupplier: true });
    await check(storeId, async () => [atWarehouse]);

    const whileHeld = await findHeldStoresForBell(database, tenants.tenantA, 100);
    await check(storeId, async () => [atHome]);
    const afterFix = await findHeldStoresForBell(database, tenants.tenantA, 100);

    expect(
      whileHeld.find((store) => store.storeConnectionId === storeId)?.heldSince,
    ).toBeInstanceOf(Date);
    expect(afterFix.some((store) => store.storeConnectionId === storeId)).toBe(false);
  });
});
