import { schema } from "@sellbridge/database";
import type { StoreCredentials } from "@sellbridge/marketplaces";
import type { AccountAddress } from "@sellbridge/shared/buyer-address";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestProduct,
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createBuyerAddressCheckProcessor } from "./buyer-address-check.ts";

const environment = createWorkerTestEnvironment();
const { database, cipher } = environment;

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let supplier: Awaited<ReturnType<typeof createTestProduct>>;

const WAREHOUSE = { cep: "30130110", street: "Avenida Afonso Pena", number: "1500" };

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
  supplier = await createTestProduct(database, { sku: "ADDRESS-WORKER", title: "Fone", stock: 5 });
  await database.execute(
    sql`update suppliers set fiscal_profile = ${JSON.stringify({ address: WAREHOUSE })}::jsonb
      where id = ${supplier.supplierId}`,
  );
});

afterAll(async () => {
  await tenants.cleanup();
  await supplier.cleanup();
  await database.$client.end();
});

/** A connected Mercado Livre store selling the test supplier. */
async function createMercadoLivreStore() {
  const store = await createTestStore(environment, tenants.first);
  await database
    .update(schema.storeConnections)
    .set({ marketplace: "mercado_livre" })
    .where(eq(schema.storeConnections.id, store.id));
  await database
    .insert(schema.storeSuppliers)
    .values({ storeConnectionId: store.id, supplierId: supplier.supplierId });
  return store;
}

type ReadAddresses = (store: StoreCredentials) => Promise<readonly AccountAddress[]>;

const atWarehouse: AccountAddress = {
  zipCode: "30130110",
  street: "Av. Afonso Pena",
  number: "1500",
  types: ["buying", "shipping"],
};
const atHome: AccountAddress = {
  zipCode: "01310100",
  street: "Rua Augusta",
  number: "200",
  types: ["buying"],
};

describe("buyer address check processor", () => {
  it("checks each due store with its own token and quota, and keeps each verdict", async () => {
    const wrong = await createMercadoLivreStore();
    const right = await createMercadoLivreStore();
    const wrongToken = cipher.decrypt(wrong.accessTokenEnc ?? "");
    const readAddresses = vi.fn<ReadAddresses>(async (store) =>
      store.accessToken === wrongToken ? [atWarehouse] : [atHome],
    );
    const acquireRateLimit = vi.fn<(key: string) => Promise<void>>(async () => undefined);
    const process = createBuyerAddressCheckProcessor({
      database,
      cipher,
      acquireRateLimit,
      readAddresses,
    });

    await process();

    const rows = await database
      .select({
        storeConnectionId: schema.storeBuyerAddressChecks.storeConnectionId,
        result: schema.storeBuyerAddressChecks.result,
        supplierId: schema.storeBuyerAddressChecks.supplierId,
      })
      .from(schema.storeBuyerAddressChecks)
      .where(inArray(schema.storeBuyerAddressChecks.storeConnectionId, [wrong.id, right.id]));
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          storeConnectionId: wrong.id,
          result: "supplier_address",
          supplierId: supplier.supplierId,
        },
        { storeConnectionId: right.id, result: "ok", supplierId: null },
      ]),
    );
    expect(acquireRateLimit).toHaveBeenCalledWith(`mercado_livre:${wrong.id}`);
    expect(acquireRateLimit).toHaveBeenCalledWith(`mercado_livre:${right.id}`);
  });

  it("does not ask again for a store checked less than a day ago", async () => {
    const store = await createMercadoLivreStore();
    const readAddresses = vi.fn<ReadAddresses>(async () => [atHome]);
    const process = createBuyerAddressCheckProcessor({
      database,
      cipher,
      acquireRateLimit: async () => undefined,
      readAddresses,
    });
    await process();
    const callsAfterFirstRun = readAddresses.mock.calls.length;

    await process();

    expect(callsAfterFirstRun).toBeGreaterThan(0);
    expect(readAddresses.mock.calls.length).toBe(callsAfterFirstRun);
    const [row] = await database
      .select({ result: schema.storeBuyerAddressChecks.result })
      .from(schema.storeBuyerAddressChecks)
      .where(eq(schema.storeBuyerAddressChecks.storeConnectionId, store.id));
    expect(row?.result).toBe("ok");
  });
});
