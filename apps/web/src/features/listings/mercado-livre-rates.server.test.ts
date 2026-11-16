import { beforeEach, describe, expect, it, vi } from "vitest";

interface SavedQuote {
  quoteKey: string;
  amount: number;
  readAt: Date;
}

interface StoreAccess {
  storeConnectionId: string;
  externalShopId: string;
  accessTokenEnc: string;
}

interface ProductProfile {
  categoryId: string | null;
  attributes: Record<string, string>;
  weightGrams: number | null;
}

const mocks = vi.hoisted(() => ({
  access: vi.fn<() => Promise<StoreAccess[]>>(),
  profile: vi.fn<() => Promise<ProductProfile | null>>(),
  saved: new Map<string, Map<string, { amount: number; readAt: Date }>>(),
  fetch: vi.fn<(input: string | URL | Request) => Promise<Response>>(),
  decrypt: vi.fn<(value: string) => string>((value) => `token-${value}`),
  warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findMercadoLivreFeeAccess: mocks.access,
  findProductFeeProfile: mocks.profile,
  findFeeQuotes: async (_database: unknown, storeId: string, keys: readonly string[]) => {
    const store = mocks.saved.get(storeId) ?? new Map();
    return new Map(keys.flatMap((key) => (store.has(key) ? [[key, store.get(key)]] : [])));
  },
  saveFeeQuotes: async (_database: unknown, storeId: string, quotes: readonly SavedQuote[]) => {
    const store = mocks.saved.get(storeId) ?? new Map();
    for (const { quoteKey, amount, readAt } of quotes) {
      store.set(quoteKey, { amount, readAt });
    }
    mocks.saved.set(storeId, store);
  },
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    ESTIMATED_MARKETPLACE_FEE_BASIS_POINTS: 1_400,
    PLATFORM_FEE_BASIS_POINTS: 0,
    MIN_MARGIN_PERCENT: 0,
  },
}));
vi.mock("@/lib/server/marketplaces", () => ({
  mercadoLivreApiConfig: {
    clientId: "client",
    clientSecret: "secret",
    fetchImplementation: mocks.fetch,
    retry: { retries: 0 },
  },
  tokenCipher: { decrypt: mocks.decrypt },
}));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { info: mocks.warn, warn: mocks.warn, error: mocks.warn },
}));
import { mercadoLivreShippingBands } from "@sellbridge/shared/mercado-livre-shipping";
import { readMercadoLivreRates } from "./mercado-livre-rates.server";

const greenStore = { storeConnectionId: "store-green", externalShopId: "11", accessTokenEnc: "g" };
const yellowStore = {
  storeConnectionId: "store-yellow",
  externalShopId: "22",
  accessTokenEnc: "y",
};
const packaged = {
  categoryId: "MLB1234",
  attributes: {
    SELLER_PACKAGE_HEIGHT: "10",
    SELLER_PACKAGE_WIDTH: "15",
    SELLER_PACKAGE_LENGTH: "20",
    SELLER_PACKAGE_WEIGHT: "300",
  },
  weightGrams: 300,
};
const request = { productId: "product", storeIds: ["store-green", "store-yellow"] };

/** Answers like Mercado Livre: 14% for the category; shipping R$ 6,85 (green) or R$ 10 (yellow). */
function answerLikeMercadoLivre(input: string | URL | Request): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname === "/sites/MLB/listing_prices") {
    return Promise.resolve(
      Response.json([
        { listing_type_id: "gold_special", sale_fee_details: { percentage_fee: 14 } },
      ]),
    );
  }
  const listCost = url.pathname === "/users/22/shipping_options/free" ? 10 : 6.85;
  return Promise.resolve(Response.json({ coverage: { all_country: { list_cost: listCost } } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saved.clear();
  mocks.access.mockResolvedValue([greenStore]);
  mocks.profile.mockResolvedValue(packaged);
  mocks.fetch.mockImplementation(answerLikeMercadoLivre);
});

describe("readMercadoLivreRates", () => {
  it("reads the commission and every shipping band with the store's own account", async () => {
    const reading = await readMercadoLivreRates("tenant", request);

    expect(reading?.liveCommission).toBe(true);
    expect(reading?.liveShipping).toBe(true);
    expect(reading?.rates.commissionBasisPoints).toBe(1_400);
    expect(reading?.rates.shippingBands.map((band) => band.shippingCents)).toEqual(
      Array.from({ length: 8 }, () => 685),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(9);
    expect(mocks.decrypt).toHaveBeenCalledWith("g");
    expect(mocks.saved.get("store-green")?.size).toBe(9);
  });

  it("asks nothing again within a day", async () => {
    await readMercadoLivreRates("tenant", request);
    mocks.fetch.mockClear();

    const reading = await readMercadoLivreRates("tenant", request);

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(reading?.liveShipping).toBe(true);
  });

  it("prices on the estimate and the published table when Mercado Livre does not answer", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ message: "down" }, { status: 503 }));

    const reading = await readMercadoLivreRates("tenant", request);

    expect(reading).toEqual({
      rates: { commissionBasisPoints: 1_400, shippingBands: mercadoLivreShippingBands(300) },
      liveCommission: false,
      liveShipping: false,
      readAt: null,
    });
    expect(mocks.warn).toHaveBeenCalledWith(
      "mercado_livre.fee_quote_failed",
      expect.objectContaining({ storeConnectionId: "store-green", quote: "shipping" }),
    );
  });

  it("uses the published table for shipping when the package has no measures", async () => {
    mocks.profile.mockResolvedValue({ ...packaged, attributes: {} });

    const reading = await readMercadoLivreRates("tenant", request);

    expect(reading?.liveCommission).toBe(true);
    expect(reading?.liveShipping).toBe(false);
    expect(reading?.rates.shippingBands).toEqual(mercadoLivreShippingBands(300));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("uses the configured commission when the product has no Mercado Livre category", async () => {
    mocks.profile.mockResolvedValue({ ...packaged, categoryId: null });

    const reading = await readMercadoLivreRates("tenant", request);

    expect(reading?.liveCommission).toBe(false);
    expect(reading?.liveShipping).toBe(true);
  });

  it("prices several stores on the costliest one", async () => {
    mocks.access.mockResolvedValue([greenStore, yellowStore]);

    const reading = await readMercadoLivreRates("tenant", request);

    expect(reading?.rates.shippingBands.every((band) => band.shippingCents === 1_000)).toBe(true);
  });

  it("prices a store whose token cannot be read on the estimate", async () => {
    mocks.decrypt.mockImplementationOnce(() => {
      throw new Error("bad ciphertext");
    });

    const reading = await readMercadoLivreRates("tenant", request);

    expect(reading?.liveCommission).toBe(false);
    expect(mocks.warn).toHaveBeenCalledWith(
      "mercado_livre.fee_rates_unavailable",
      expect.objectContaining({ storeConnectionId: "store-green" }),
    );
  });

  it("is null without a connected Mercado Livre store", async () => {
    mocks.access.mockResolvedValue([]);

    expect(await readMercadoLivreRates("tenant", request)).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
