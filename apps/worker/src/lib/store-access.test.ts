import { schema } from "@sellbridge/database";
import { marketplaceAuthError } from "@sellbridge/marketplaces";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestStore,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { expireStoreOnAuthError } from "./store-access.ts";

const environment = createWorkerTestEnvironment();
const { database } = environment;
let tenants: Awaited<ReturnType<typeof createTestTenants>>;

beforeAll(async () => {
  tenants = await createTestTenants(database, 1);
});

afterAll(async () => {
  await tenants.cleanup();
  await database.$client.end();
});

async function statusOf(storeId: string) {
  const row = await database.query.storeConnections.findFirst({
    where: eq(schema.storeConnections.id, storeId),
  });
  return row?.status;
}

describe("expireStoreOnAuthError", () => {
  it("ignores errors that are not about credentials", async () => {
    const store = await createTestStore(environment, tenants.first);
    expect(await expireStoreOnAuthError(database, store, new Error("timeout"))).toBe(false);
    expect(await statusOf(store.id)).toBe("connected");
  });

  it("never expires a store reconnected after the refused call started", async () => {
    const store = await createTestStore(environment, tenants.first);
    const staleCall = { id: store.id, accessTokenEnc: store.accessTokenEnc };
    // The seller reconnects: a new token is saved while a long sync still holds the old one.
    await database
      .update(schema.storeConnections)
      .set({ accessTokenEnc: "enc-token-novo" })
      .where(eq(schema.storeConnections.id, store.id));
    expect(await expireStoreOnAuthError(database, staleCall, marketplaceAuthError())).toBe(false);
    expect(await statusOf(store.id)).toBe("connected");

    const currentCall = { id: store.id, accessTokenEnc: "enc-token-novo" };
    expect(await expireStoreOnAuthError(database, currentCall, marketplaceAuthError())).toBe(true);
    expect(await statusOf(store.id)).toBe("expired");
  });
});
