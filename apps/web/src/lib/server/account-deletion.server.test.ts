import { conflictError, isAppError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSoleOwnedTenants: vi.fn<(database: unknown, userId: string) => Promise<string[]>>(),
  accountFileKeys: vi.fn<(database: unknown, account: unknown) => Promise<string[]>>(),
  deleteTenantData: vi.fn<(database: unknown, tenantId: string) => Promise<void>>(),
  forgetBillingCustomer: vi.fn<(database: unknown, tenantId: string) => Promise<void>>(),
  getBillingAccount:
    vi.fn<(database: unknown, tenantId: string) => Promise<{ customerId: string | null } | null>>(),
  listStoreConnections:
    vi.fn<
      (
        database: unknown,
        tenantId: string,
      ) => Promise<{ id: string; status: string; marketplace: string }[]>
    >(),
  disconnectStoreForTenant: vi.fn<(request: unknown) => Promise<unknown>>(),
  deleteCustomer: vi.fn<(customerId: string) => Promise<unknown>>(),
  deleteFile: vi.fn<(key: string) => Promise<void>>(),
  assertNothingLeftToResolve: vi.fn<(input: unknown) => Promise<void>>(),
  requestStockSync: vi.fn<(failureEvent: string) => Promise<boolean>>(),
  findLiveStoreTargets:
    vi.fn<
      (
        database: unknown,
        store: unknown,
      ) => Promise<{ targetId: string; externalId: string; priceCents: number }[]>
    >(),
  findStoreAccessForPause:
    vi.fn<
      (
        database: unknown,
        store: unknown,
      ) => Promise<{ marketplace: string; externalShopId: string; accessTokenEnc: string } | null>
    >(),
  enqueueDeletedStorePause: vi.fn<(job: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { ADMIN_EMAILS: ["dono@sellbridge.test"] },
}));
vi.mock("@/lib/server/account-deletion-blockers.server", () => ({
  assertNothingLeftToResolve: mocks.assertNothingLeftToResolve,
}));
vi.mock("@/lib/server/queues", () => ({
  enqueueDeletedStorePause: mocks.enqueueDeletedStorePause,
}));
vi.mock("@/lib/server/stock-sync", () => ({ requestStockSync: mocks.requestStockSync }));
vi.mock("@/lib/server/storage", () => ({ fileStorage: { delete: mocks.deleteFile } }));
vi.mock("@/features/billing/stripe.server", () => ({
  billingConfigured: () => true,
  stripeClient: () => ({ customers: { del: mocks.deleteCustomer } }),
}));
vi.mock("@/features/stores/disconnect-store.server", () => ({
  disconnectStoreForTenant: mocks.disconnectStoreForTenant,
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findSoleOwnedTenants: mocks.findSoleOwnedTenants,
  accountFileKeys: mocks.accountFileKeys,
  deleteTenantData: mocks.deleteTenantData,
  forgetBillingCustomer: mocks.forgetBillingCustomer,
  getBillingAccount: mocks.getBillingAccount,
  listStoreConnections: mocks.listStoreConnections,
  findLiveStoreTargets: mocks.findLiveStoreTargets,
  findStoreAccessForPause: mocks.findStoreAccessForPause,
}));

const { assertDeletionRequest, beforeAccountDeletion, prepareAccountDeletion } =
  await import("./account-deletion.server");

const SELLER = {
  id: "user-1",
  email: "ana@loja.test",
  emailVerified: true,
  role: "user",
  image: "/api/perfil/foto/user-1/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0.png",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSoleOwnedTenants.mockResolvedValue(["tenant-a"]);
  mocks.accountFileKeys.mockResolvedValue(["tickets/t1/nota.pdf"]);
  mocks.getBillingAccount.mockResolvedValue({ customerId: "cus_123" });
  mocks.listStoreConnections.mockResolvedValue([
    { id: "store-1", status: "connected", marketplace: "mercado_livre" },
    { id: "store-2", status: "expired", marketplace: "mercado_livre" },
  ]);
  mocks.disconnectStoreForTenant.mockResolvedValue({ paused: 1, leftLive: 0 });
  mocks.deleteCustomer.mockResolvedValue({ deleted: true });
  mocks.deleteFile.mockResolvedValue(undefined);
  mocks.deleteTenantData.mockResolvedValue(undefined);
  mocks.forgetBillingCustomer.mockResolvedValue(undefined);
  mocks.assertNothingLeftToResolve.mockResolvedValue(undefined);
  mocks.requestStockSync.mockResolvedValue(true);
  mocks.findLiveStoreTargets.mockResolvedValue([
    { targetId: "target-1", externalId: "MLB1", priceCents: 4990 },
  ]);
  // Like the repository: only a connected store still has access to call the marketplace with.
  mocks.findStoreAccessForPause.mockImplementation(async (_database, store) =>
    Reflect.get(Object(store), "storeConnectionId") === "store-1"
      ? {
          marketplace: "mercado_livre",
          externalShopId: "shop-1",
          accessTokenEnc: "encrypted-token",
        }
      : null,
  );
  mocks.enqueueDeletedStorePause.mockResolvedValue(undefined);
});

const LEFT_TO_RESOLVE = conflictError("Antes de excluir a conta, resolva: 2 pedidos para enviar.");

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

describe("prepareAccountDeletion", () => {
  it("closes the workspace the seller owns alone: billing, stores, data and files", async () => {
    await prepareAccountDeletion(SELLER);
    expect(mocks.deleteCustomer).toHaveBeenCalledWith("cus_123");
    expect(mocks.disconnectStoreForTenant).toHaveBeenCalledTimes(1);
    expect(mocks.disconnectStoreForTenant).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      storeConnectionId: "store-1",
      pauseListings: false,
    });
    expect(mocks.deleteTenantData).toHaveBeenCalledWith({}, "tenant-a");
    expect(mocks.deleteFile).toHaveBeenCalledWith("tickets/t1/nota.pdf");
    expect(mocks.deleteFile).toHaveBeenCalledWith(
      "avatars/user-1/0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0.png",
    );
    const billing = mocks.deleteCustomer.mock.invocationCallOrder[0] ?? 0;
    const data = mocks.deleteTenantData.mock.invocationCallOrder[0] ?? 0;
    expect(billing).toBeLessThan(data);
  });

  // Regression: pausing a deleted account's listings goes to a job that retries until done.
  it("hands every live listing to the worker that pauses them, before the data goes", async () => {
    await prepareAccountDeletion(SELLER);

    expect(mocks.enqueueDeletedStorePause).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      storeConnectionId: "store-1",
      marketplace: "mercado_livre",
      externalShopId: "shop-1",
      accessTokenEnc: "encrypted-token",
      listings: [{ externalId: "MLB1", priceCents: 4990 }],
    });
    const handedOver = mocks.enqueueDeletedStorePause.mock.invocationCallOrder[0] ?? 0;
    const data = mocks.deleteTenantData.mock.invocationCallOrder[0] ?? 0;
    expect(handedOver).toBeLessThan(data);
  });

  it("stops before disconnecting or deleting when the listings cannot be handed over", async () => {
    mocks.enqueueDeletedStorePause.mockRejectedValue(new Error("redis down"));

    const error = await rejection(prepareAccountDeletion(SELLER));

    expect(isAppError(error) && error.userMessage).toBe(
      "Não foi possível pausar seus anúncios agora. Tente excluir a conta de novo em alguns minutos.",
    );
    expect(mocks.disconnectStoreForTenant).not.toHaveBeenCalled();
    expect(mocks.deleteTenantData).not.toHaveBeenCalled();
  });

  it("names on Problemas the listings a store without access leaves live", async () => {
    const reportError = vi.spyOn(logger, "error");

    await prepareAccountDeletion(SELLER);

    expect(mocks.enqueueDeletedStorePause).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith("account.deleted_store_listings_unpausable", {
      tenantId: "tenant-a",
      storeConnectionId: "store-2",
      marketplace: "mercado_livre",
      listings: 1,
      externalIds: "id_MLB1",
    });
  });

  it("has nothing to hand over for a store without live listings", async () => {
    mocks.findLiveStoreTargets.mockResolvedValue([]);

    await prepareAccountDeletion(SELLER);

    expect(mocks.enqueueDeletedStorePause).not.toHaveBeenCalled();
    expect(mocks.deleteTenantData).toHaveBeenCalledWith({}, "tenant-a");
  });

  it("stops before touching any data when the subscription cannot be cancelled", async () => {
    mocks.deleteCustomer.mockRejectedValue(new Error("Stripe fora do ar"));
    const error = await rejection(prepareAccountDeletion(SELLER));
    expect(isAppError(error)).toBe(true);
    expect(mocks.deleteTenantData).not.toHaveBeenCalled();
    expect(mocks.disconnectStoreForTenant).not.toHaveBeenCalled();
  });

  it("stops before the subscription or any data while something is left to resolve", async () => {
    mocks.assertNothingLeftToResolve.mockRejectedValue(LEFT_TO_RESOLVE);

    const error = await rejection(prepareAccountDeletion(SELLER));

    expect(error).toBe(LEFT_TO_RESOLVE);
    expect(mocks.assertNothingLeftToResolve).toHaveBeenCalledWith({
      userId: "user-1",
      tenantIds: ["tenant-a"],
    });
    expect(mocks.deleteCustomer).not.toHaveBeenCalled();
    expect(mocks.disconnectStoreForTenant).not.toHaveBeenCalled();
    expect(mocks.deleteTenantData).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();
  });

  it("asks for a stock sync once the workspaces are gone, so a closed supplier stops selling", async () => {
    await prepareAccountDeletion(SELLER);

    const data = mocks.deleteTenantData.mock.invocationCallOrder[0] ?? 0;
    const sync = mocks.requestStockSync.mock.invocationCallOrder[0] ?? 0;
    expect(data).toBeLessThan(sync);
  });

  it("keeps a workspace that another owner still runs", async () => {
    mocks.findSoleOwnedTenants.mockResolvedValue([]);
    await prepareAccountDeletion(SELLER);
    expect(mocks.deleteTenantData).not.toHaveBeenCalled();
    expect(mocks.deleteCustomer).not.toHaveBeenCalled();
    expect(mocks.requestStockSync).not.toHaveBeenCalled();
  });

  it("refuses team accounts and the platform owner", async () => {
    // The owner check needs a verified ADMIN_EMAILS address with the admin role; a plain
    // "user" role on that address is not the owner, and "agent" is refused as team.
    for (const account of [
      { ...SELLER, role: "agent" },
      { ...SELLER, email: "dono@sellbridge.test", role: "admin,user" },
    ]) {
      const error = await rejection(prepareAccountDeletion(account));
      expect(isAppError(error) && error.code === "FORBIDDEN").toBe(true);
    }
    expect(mocks.deleteTenantData).not.toHaveBeenCalled();
  });
});

describe("retries and workspaces", () => {
  it("goes on when Stripe already deleted the customer (a retried deletion)", async () => {
    mocks.deleteCustomer.mockRejectedValue(
      Object.assign(new Error("No such customer"), { code: "resource_missing" }),
    );
    await prepareAccountDeletion(SELLER);
    expect(mocks.forgetBillingCustomer).toHaveBeenCalledWith({}, "tenant-a");
    expect(mocks.deleteTenantData).toHaveBeenCalledWith({}, "tenant-a");
  });

  it("forgets the Stripe customer right after deleting it", async () => {
    await prepareAccountDeletion(SELLER);
    const deleted = mocks.deleteCustomer.mock.invocationCallOrder[0] ?? 0;
    const forgotten = mocks.forgetBillingCustomer.mock.invocationCallOrder[0] ?? 0;
    expect(deleted).toBeLessThan(forgotten);
  });

  it("closes the billing of every workspace before deleting any of them", async () => {
    mocks.findSoleOwnedTenants.mockResolvedValue(["tenant-a", "tenant-b"]);
    await prepareAccountDeletion(SELLER);
    expect(mocks.deleteTenantData.mock.calls.map(([, tenantId]) => tenantId)).toEqual([
      "tenant-a",
      "tenant-b",
    ]);
    const lastBilling = mocks.deleteCustomer.mock.invocationCallOrder.at(-1) ?? 0;
    const firstData = mocks.deleteTenantData.mock.invocationCallOrder[0] ?? 0;
    expect(lastBilling).toBeLessThan(firstData);
  });
});

describe("beforeAccountDeletion", () => {
  it("answers Better Auth with 403 for team accounts and 503 when Stripe fails", async () => {
    const team = await rejection(beforeAccountDeletion({ ...SELLER, role: "agent" }));
    expect(team).toMatchObject({ statusCode: 403 });
    mocks.deleteCustomer.mockRejectedValue(new Error("Stripe fora do ar"));
    const stripe = await rejection(beforeAccountDeletion(SELLER));
    expect(stripe).toMatchObject({ statusCode: 503 });
  });
});

describe("beforeAccountDeletion with something left to resolve", () => {
  it("answers Better Auth with 409 and the list, in the words the screen shows", async () => {
    mocks.assertNothingLeftToResolve.mockRejectedValue(LEFT_TO_RESOLVE);

    const error = await rejection(beforeAccountDeletion(SELLER));

    expect(error).toMatchObject({
      statusCode: 409,
      body: { message: "Antes de excluir a conta, resolva: 2 pedidos para enviar." },
    });
  });
});

describe("assertDeletionRequest", () => {
  it("asks for the password and refuses the e-mailed token path", () => {
    expect(() => assertDeletionRequest({ password: "senha-segura-123" })).not.toThrow();
    expect(() => assertDeletionRequest({})).toThrow("Digite sua senha para excluir a conta");
    expect(() => assertDeletionRequest({ password: "" })).toThrow(
      "Digite sua senha para excluir a conta",
    );
    expect(() => assertDeletionRequest({ password: "x", token: "abc" })).toThrow(
      "Exclusão por link não está disponível",
    );
  });
});
