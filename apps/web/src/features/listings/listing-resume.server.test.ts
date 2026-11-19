import { DEFAULT_FEE_SCHEDULE } from "@sellbridge/shared/fee-model";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findListingsPausedByDisconnection: vi.fn<() => Promise<unknown[]>>(),
  findPausedListings: vi.fn<() => Promise<unknown[]>>(),
  holdListingsBelowPriceFloor:
    vi.fn<(database: unknown, tenantId: string, scope: unknown) => Promise<number>>(),
  resumeStoreListingsPausedByDisconnection:
    vi.fn<
      (database: unknown, tenantId: string, storeId: string, ids: string[]) => Promise<number>
    >(),
  setListingsPaused:
    vi.fn<
      (database: unknown, tenantId: string, ids: string[], paused: boolean) => Promise<number>
    >(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({ environment: {} }));
vi.mock("@/features/reports/fee-schedule", () => ({
  feeScheduleFrom: () => DEFAULT_FEE_SCHEDULE,
}));
vi.mock("./mercado-livre-rates.server", () => ({ readMercadoLivreRates: async () => null }));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { resumeListingsForTenant, resumeReconnectedStoreForTenant } =
  await import("./listing-resume.server");

function candidate(listingId: string, priceCents: number) {
  return {
    listingId,
    title: `Anúncio ${listingId}`,
    productId: `product-${listingId}`,
    priceCents,
    costCents: 1_000,
    weightGrams: 300,
    storeIds: ["store-1"],
    marketplaces: ["mercado_livre"],
  };
}

const PAYING = candidate("paying", 9_990);
/** One real above the cost: the fees take more than that. */
const LOSING = candidate("losing", 1_100);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.holdListingsBelowPriceFloor.mockResolvedValue(1);
  mocks.resumeStoreListingsPausedByDisconnection.mockImplementation(
    async (_database, _tenant, _store, ids) => ids.length,
  );
  mocks.setListingsPaused.mockImplementation(async (_database, _tenant, ids) => ids.length);
});

describe("resumeReconnectedStoreForTenant", () => {
  it("resumes what still pays and keeps what would lose money paused on that store", async () => {
    mocks.findListingsPausedByDisconnection.mockResolvedValue([PAYING, LOSING]);

    const outcome = await resumeReconnectedStoreForTenant("tenant-a", "store-1");

    expect(outcome).toEqual({ changed: 1, held: 1 });
    expect(mocks.holdListingsBelowPriceFloor).toHaveBeenCalledWith({}, "tenant-a", {
      listingIds: ["losing"],
      storeConnectionId: "store-1",
    });
    expect(mocks.resumeStoreListingsPausedByDisconnection).toHaveBeenCalledWith(
      {},
      "tenant-a",
      "store-1",
      ["paying"],
    );
  });
});

describe("resumeListingsForTenant", () => {
  it("resumes the listings that pay and reports the ones kept paused", async () => {
    mocks.findPausedListings.mockResolvedValue([PAYING, LOSING]);

    const outcome = await resumeListingsForTenant("tenant-a", ["paying", "losing"]);

    expect(outcome).toEqual({ changed: 1, held: 1 });
    expect(mocks.setListingsPaused).toHaveBeenCalledWith({}, "tenant-a", ["paying"], false);
  });

  it("refuses with what to do when every listing asked would lose money", async () => {
    mocks.findPausedListings.mockResolvedValue([LOSING]);

    const resuming = resumeListingsForTenant("tenant-a", ["losing"]);

    await expect(resuming).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("Ajuste o preço para reativar."),
    });
    expect(mocks.holdListingsBelowPriceFloor).toHaveBeenCalledWith({}, "tenant-a", {
      listingIds: ["losing"],
    });
    expect(mocks.setListingsPaused).not.toHaveBeenCalled();
  });
});
