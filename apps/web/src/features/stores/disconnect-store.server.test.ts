import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  disconnectStore: vi.fn<(database: unknown, tenantId: string, storeId: string) => Promise<void>>(),
  findStoreAccessForPause: vi.fn<(database: unknown, store: unknown) => Promise<unknown>>(),
  findLiveStoreTargets: vi.fn<(database: unknown, store: unknown) => Promise<unknown[]>>(),
  markStoreTargetsPaused:
    vi.fn<(database: unknown, tenantId: string, ids: readonly string[]) => Promise<number>>(),
  updateStockPrice: vi.fn<(credentials: unknown, update: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  connectors: { mock: { updateStockPrice: mocks.updateStockPrice } },
  tokenCipher: { decrypt: (value: string) => `plain:${value}` },
}));
vi.mock("@sellbridge/database/repositories", () => ({
  disconnectStore: mocks.disconnectStore,
  findStoreAccessForPause: mocks.findStoreAccessForPause,
  findLiveStoreTargets: mocks.findLiveStoreTargets,
  markStoreTargetsPaused: mocks.markStoreTargetsPaused,
}));

const { disconnectStoreForTenant } = await import("./disconnect-store.server");

const STORE = { tenantId: "tenant-a", storeConnectionId: "store-1" };
const TARGETS = [
  { targetId: "target-1", externalId: "ML-1", priceCents: 2790 },
  { targetId: "target-2", externalId: "ML-2", priceCents: 4990 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findStoreAccessForPause.mockResolvedValue({
    marketplace: "mock",
    externalShopId: "shop-1",
    accessTokenEnc: "token",
  });
  mocks.findLiveStoreTargets.mockResolvedValue(TARGETS);
  mocks.updateStockPrice.mockResolvedValue(undefined);
  mocks.markStoreTargetsPaused.mockImplementation(async (_database, _tenant, ids) => ids.length);
  mocks.disconnectStore.mockResolvedValue(undefined);
});

describe("disconnectStoreForTenant", () => {
  it("sends zero stock for every live listing before dropping the store's access", async () => {
    const outcome = await disconnectStoreForTenant({ ...STORE, pauseListings: true });
    expect(outcome).toEqual({ paused: 2, leftLive: 0 });
    expect(mocks.updateStockPrice).toHaveBeenCalledWith(
      { externalShopId: "shop-1", accessToken: "plain:token" },
      { externalId: "ML-1", stock: 0, priceCents: 2790 },
    );
    expect(mocks.markStoreTargetsPaused).toHaveBeenCalledWith({}, "tenant-a", [
      "target-1",
      "target-2",
    ]);
    const lastPause = mocks.updateStockPrice.mock.invocationCallOrder.at(-1) ?? 0;
    const disconnect = mocks.disconnectStore.mock.invocationCallOrder[0] ?? 0;
    expect(lastPause).toBeLessThan(disconnect);
  });

  it("still disconnects when the marketplace refuses some, and says how many stay live", async () => {
    mocks.updateStockPrice.mockRejectedValueOnce(new Error("Mercado Livre indisponível"));
    const outcome = await disconnectStoreForTenant({ ...STORE, pauseListings: true });
    expect(outcome).toEqual({ paused: 1, leftLive: 1 });
    expect(mocks.markStoreTargetsPaused).toHaveBeenCalledWith({}, "tenant-a", ["target-2"]);
    expect(mocks.disconnectStore).toHaveBeenCalledWith({}, "tenant-a", "store-1");
  });

  it("counts every live listing as left live when the store has no access anymore", async () => {
    mocks.findStoreAccessForPause.mockResolvedValue(null);
    const outcome = await disconnectStoreForTenant({ ...STORE, pauseListings: true });
    expect(outcome).toEqual({ paused: 0, leftLive: 2 });
    expect(mocks.updateStockPrice).not.toHaveBeenCalled();
    expect(mocks.disconnectStore).toHaveBeenCalled();
  });

  it("leaves the listings alone when the seller chose to keep them", async () => {
    const outcome = await disconnectStoreForTenant({ ...STORE, pauseListings: false });
    expect(outcome).toEqual({ paused: 0, leftLive: 0 });
    expect(mocks.findLiveStoreTargets).not.toHaveBeenCalled();
    expect(mocks.updateStockPrice).not.toHaveBeenCalled();
    expect(mocks.disconnectStore).toHaveBeenCalled();
  });
});
