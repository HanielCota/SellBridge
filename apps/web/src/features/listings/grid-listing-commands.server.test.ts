import { DEFAULT_FEE_SCHEDULE } from "@sellbridge/shared/fee-model";
import { beforeEach, describe, expect, it, vi } from "vitest";

const switches = vi.hoisted(() => ({ gridEnabled: true }));

const mocks = vi.hoisted(() => ({
  getSellableProductModel: vi.fn<() => Promise<unknown>>(),
  createListingFamilyWithListings: vi.fn<
    (
      database: unknown,
      tenantId: string,
      input: {
        familyName: string;
        listings: { supplierProductId: string; priceCents: number }[];
      },
      storeIds: string[],
    ) => Promise<unknown>
  >(),
}));
const enqueueTargets = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => {}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({ environment: { STOCK_SAFETY_UNITS: 0 } }));
vi.mock("@/lib/server/product-grid-switch", () => ({
  productGridEnabled: () => switches.gridEnabled,
}));
vi.mock("@/features/billing/billing-config.server", () => ({ billingRules: () => null }));
vi.mock("@/features/reports/fee-schedule", () => ({
  feeScheduleFrom: () => DEFAULT_FEE_SCHEDULE,
}));
vi.mock("./mercado-livre-rates.server", () => ({ readMercadoLivreRates: async () => null }));
vi.mock("./publish-listing.server", () => ({
  assertConnectedStores: async (_tenantId: string, storeIds: string[]) => ({
    storeIds,
    channels: ["mercado_livre"],
  }),
  assertStoresSellSuppliers: async () => {},
  enqueueTargets,
}));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { createGridListingForTenant } = await import("./grid-listing-commands.server");

const DESCRIPTION = "Tênis casual de couro legítimo, confortável para o dia a dia.";

function combination(id: string, stock: number) {
  return {
    id,
    sku: `SKU-${id}`,
    title: `Tênis Casual - Preto ${id}`,
    color: "Preto",
    size: id,
    costCents: 5_000,
    suggestedPriceCents: 14_990,
    stock,
    imageUrls: [],
    weightGrams: 800,
  };
}

const MODEL = {
  id: "model-1",
  title: "Tênis Casual",
  description: DESCRIPTION,
  supplierId: "supplier-1",
  supplierName: "Fornecedor",
  catalogKind: "supplier",
  combinations: [combination("38", 4), combination("39", 0), combination("40", 2)],
};

function command(overrides: Record<string, unknown> = {}) {
  return {
    modelId: "model-1",
    priceCents: 14_990,
    supplierProductIds: ["38", "39", "40"],
    storeConnectionIds: ["store-1"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  switches.gridEnabled = true;
  mocks.getSellableProductModel.mockResolvedValue(MODEL);
  mocks.createListingFamilyWithListings.mockImplementation(async (_database, _tenant, input) => ({
    familyId: "family-1",
    targetIds: input.listings.map((draft) => `target-${draft.supplierProductId}`),
    listed: input.listings.map((draft) => ({
      supplierProductId: draft.supplierProductId,
      listingId: `listing-${draft.supplierProductId}`,
      storeConnectionIds: ["store-1"],
    })),
    skipped: [],
  }));
});

describe("createGridListingForTenant", () => {
  it("answers as missing while grids are off", async () => {
    switches.gridEnabled = false;

    const attempt = createGridListingForTenant("tenant-a", command());

    await expect(attempt).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getSellableProductModel).not.toHaveBeenCalled();
  });

  it("publishes the sizes in stock under the grid's name and reports the one without stock", async () => {
    const outcome = await createGridListingForTenant(
      "tenant-a",
      command({ combinationPrices: [{ supplierProductId: "40", priceCents: 16_990 }] }),
    );

    const [, , input] = mocks.createListingFamilyWithListings.mock.calls[0] ?? [];
    expect(input?.familyName).toBe("Tênis Casual");
    expect(
      input?.listings.map(({ supplierProductId, priceCents }) => [supplierProductId, priceCents]),
    ).toEqual([
      ["38", 14_990],
      ["40", 16_990],
    ]);
    expect(outcome).toMatchObject({
      published: 2,
      skipped: [{ supplierProductId: "39", reason: { kind: "out_of_stock" } }],
    });
    expect(enqueueTargets).toHaveBeenCalledWith("tenant-a", ["target-38", "target-40"]);
  });

  it("refuses the whole grid when one size's price would lose money", async () => {
    const attempt = createGridListingForTenant(
      "tenant-a",
      command({ combinationPrices: [{ supplierProductId: "40", priceCents: 5_100 }] }),
    );

    await expect(attempt).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.createListingFamilyWithListings).not.toHaveBeenCalled();
  });

  it("refuses a size that is no longer on sale", async () => {
    const attempt = createGridListingForTenant(
      "tenant-a",
      command({ supplierProductIds: ["38", "41"] }),
    );

    await expect(attempt).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses when every chosen size is out of stock", async () => {
    const attempt = createGridListingForTenant("tenant-a", command({ supplierProductIds: ["39"] }));

    await expect(attempt).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
