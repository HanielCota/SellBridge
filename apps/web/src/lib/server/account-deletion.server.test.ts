import { isAppError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSoleOwnedTenants: vi.fn<(database: unknown, userId: string) => Promise<string[]>>(),
  accountFileKeys: vi.fn<(database: unknown, account: unknown) => Promise<string[]>>(),
  deleteTenantData: vi.fn<(database: unknown, tenantId: string) => Promise<void>>(),
  forgetBillingCustomer: vi.fn<(database: unknown, tenantId: string) => Promise<void>>(),
  getBillingAccount:
    vi.fn<(database: unknown, tenantId: string) => Promise<{ customerId: string | null } | null>>(),
  listStoreConnections:
    vi.fn<(database: unknown, tenantId: string) => Promise<{ id: string; status: string }[]>>(),
  disconnectStoreForTenant: vi.fn<(request: unknown) => Promise<unknown>>(),
  deleteCustomer: vi.fn<(customerId: string) => Promise<unknown>>(),
  deleteFile: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { ADMIN_EMAILS: ["dono@sellbridge.test"] },
}));
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
    { id: "store-1", status: "connected" },
    { id: "store-2", status: "expired" },
  ]);
  mocks.disconnectStoreForTenant.mockResolvedValue({ paused: 1, leftLive: 0 });
  mocks.deleteCustomer.mockResolvedValue({ deleted: true });
  mocks.deleteFile.mockResolvedValue(undefined);
  mocks.deleteTenantData.mockResolvedValue(undefined);
  mocks.forgetBillingCustomer.mockResolvedValue(undefined);
});

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
      pauseListings: true,
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

  it("stops before touching any data when the subscription cannot be cancelled", async () => {
    mocks.deleteCustomer.mockRejectedValue(new Error("Stripe fora do ar"));
    const error = await rejection(prepareAccountDeletion(SELLER));
    expect(isAppError(error)).toBe(true);
    expect(mocks.deleteTenantData).not.toHaveBeenCalled();
    expect(mocks.disconnectStoreForTenant).not.toHaveBeenCalled();
  });

  it("keeps a workspace that another owner still runs", async () => {
    mocks.findSoleOwnedTenants.mockResolvedValue([]);
    await prepareAccountDeletion(SELLER);
    expect(mocks.deleteTenantData).not.toHaveBeenCalled();
    expect(mocks.deleteCustomer).not.toHaveBeenCalled();
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
