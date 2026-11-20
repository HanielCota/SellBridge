import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findConnectedStores:
    vi.fn<(database: unknown, tenantId: string, ids: string[]) => Promise<unknown[]>>(),
  findStoresHeldByBuyerAddress:
    vi.fn<
      (
        database: unknown,
        tenantId: string,
        ids: readonly string[],
      ) => Promise<{ id: string; shopName: string }[]>
    >(),
}));

vi.mock("@sellbridge/database/repositories", () => ({
  findConnectedStores: mocks.findConnectedStores,
  findStoresHeldByBuyerAddress: mocks.findStoresHeldByBuyerAddress,
}));
vi.mock("@/features/billing/billing-config.server", () => ({ billingRules: () => null }));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({ enqueuePublishJobs: vi.fn<() => Promise<void>>() }));

const { assertConnectedStores } = await import("./publish-listing.server");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findConnectedStores.mockResolvedValue([{ id: "store-1", marketplace: "mercado_livre" }]);
  mocks.findStoresHeldByBuyerAddress.mockResolvedValue([]);
});

describe("assertConnectedStores", () => {
  it("lets a connected store whose account buys elsewhere publish", async () => {
    const stores = await assertConnectedStores("tenant-1", ["store-1", "store-1"]);

    expect(stores.storeIds).toEqual(["store-1"]);
    expect(mocks.findStoresHeldByBuyerAddress).toHaveBeenCalledWith({}, "tenant-1", ["store-1"]);
  });

  it("holds new products back while the store buys at its supplier's address", async () => {
    mocks.findStoresHeldByBuyerAddress.mockResolvedValue([
      { id: "store-1", shopName: "Loja da Ana" },
    ]);

    await expect(assertConnectedStores("tenant-1", ["store-1"])).rejects.toThrow(
      "A loja Loja da Ana compra no endereço do fornecedor",
    );
  });
});
