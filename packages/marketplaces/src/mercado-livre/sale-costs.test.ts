import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../http.ts";
import {
  packageDimensionsOf,
  readMercadoLivreCommission,
  readMercadoLivreShippingCost,
} from "./sale-costs.ts";

const store = { externalShopId: "99", accessToken: "test-token" };
const dimensions = {
  heightCentimeters: 10,
  widthCentimeters: 15,
  lengthCentimeters: 20,
  weightGrams: 450,
};

function configAnswering(body: unknown, status = 200) {
  const request = vi.fn<FetchLike>(async () => Response.json(body, { status }));
  return {
    request,
    config: {
      clientId: "client",
      clientSecret: "secret",
      fetchImplementation: request,
      retry: { retries: 0 },
    },
  };
}

function requestedUrl(request: ReturnType<typeof configAnswering>["request"]): URL {
  const [input] = request.mock.calls[0] ?? [];
  return new URL(String(input));
}

/** The shape of the official page's "Filtrar por preço e listing type" answer, for MLB. */
const listingPrices = [
  {
    currency_id: "BRL",
    listing_type_id: "gold_special",
    listing_type_name: "Clássico",
    sale_fee_amount: 4.75,
    sale_fee_details: {
      financing_add_on_fee: 0,
      fixed_fee: 0,
      gross_amount: 4.75,
      meli_percentage_fee: 0,
      percentage_fee: 14,
    },
  },
];

describe("readMercadoLivreCommission", () => {
  it("reads the Clássico percentage for the category with the store's token", async () => {
    const { request, config } = configAnswering(listingPrices);

    const basisPoints = await readMercadoLivreCommission(config, store, {
      categoryId: "MLB1234",
      priceCents: 3390,
    });

    expect(basisPoints).toBe(1400);
    const url = requestedUrl(request);
    expect(url.pathname).toBe("/sites/MLB/listing_prices");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      price: "33.90",
      currency_id: "BRL",
      category_id: "MLB1234",
      listing_type_id: "gold_special",
      shipping_mode: "me2",
      logistic_type: "drop_off",
    });
    const init = request.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
  });

  it("keeps a fractional percentage as basis points", async () => {
    const answer = [
      {
        ...listingPrices[0],
        sale_fee_details: { ...listingPrices[0]?.sale_fee_details, percentage_fee: 11.5 },
      },
    ];
    const { config } = configAnswering(answer);

    const basisPoints = await readMercadoLivreCommission(config, store, {
      categoryId: "MLB1234",
      priceCents: 3390,
    });

    expect(basisPoints).toBe(1150);
  });

  it("refuses an answer without the Clássico listing type", async () => {
    const { config } = configAnswering([{ ...listingPrices[0], listing_type_id: "gold_pro" }]);

    await expect(
      readMercadoLivreCommission(config, store, { categoryId: "MLB1234", priceCents: 3390 }),
    ).rejects.toThrow("comissão do anúncio Clássico");
  });

  it("refuses a commission above the whole price", async () => {
    const { config } = configAnswering([
      { ...listingPrices[0], sale_fee_details: { percentage_fee: 140 } },
    ]);

    await expect(
      readMercadoLivreCommission(config, store, { categoryId: "MLB1234", priceCents: 3390 }),
    ).rejects.toThrow("Resposta inesperada do Mercado Livre");
  });

  it("refuses a price that is not a positive whole number of cents", async () => {
    const { request, config } = configAnswering(listingPrices);

    await expect(
      readMercadoLivreCommission(config, store, { categoryId: "MLB1234", priceCents: 0 }),
    ).rejects.toThrow("Preço inválido");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("readMercadoLivreShippingCost", () => {
  it("reads the seller's list cost for the package at the price", async () => {
    const { request, config } = configAnswering({
      coverage: { all_country: { list_cost: 6.85, currency_id: "BRL", billable_weight: 450 } },
    });

    const cents = await readMercadoLivreShippingCost(config, store, {
      dimensions,
      priceCents: 3390,
    });

    expect(cents).toBe(685);
    const url = requestedUrl(request);
    expect(url.pathname).toBe("/users/99/shipping_options/free");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      dimensions: "10x15x20,450",
      item_price: "33.90",
      listing_type_id: "gold_special",
      mode: "me2",
      condition: "new",
      free_shipping: "true",
      verbose: "false",
    });
  });

  it("rounds a list cost with more than two decimals to the nearest cent", async () => {
    const { config } = configAnswering({ coverage: { all_country: { list_cost: 12.345 } } });

    const cents = await readMercadoLivreShippingCost(config, store, {
      dimensions,
      priceCents: 9990,
    });

    expect(cents).toBe(1235);
  });

  it("refuses an answer without the country-wide cost", async () => {
    const { config } = configAnswering({ coverage: {} });

    await expect(
      readMercadoLivreShippingCost(config, store, { dimensions, priceCents: 3390 }),
    ).rejects.toThrow("Resposta inesperada do Mercado Livre");
  });

  it("refuses a shipping cost no package could have", async () => {
    const { config } = configAnswering({ coverage: { all_country: { list_cost: 123_456 } } });

    await expect(
      readMercadoLivreShippingCost(config, store, { dimensions, priceCents: 3390 }),
    ).rejects.toThrow("Resposta inesperada do Mercado Livre");
  });

  it("never puts a malformed account id in the path", async () => {
    const { request, config } = configAnswering({});

    await expect(
      readMercadoLivreShippingCost(
        config,
        { ...store, externalShopId: "../orders" },
        { dimensions, priceCents: 3390 },
      ),
    ).rejects.toThrow("Conta do Mercado Livre inválida");
    expect(request).not.toHaveBeenCalled();
  });
});

describe("packageDimensionsOf", () => {
  it("reads the four package measures, rounding fractions up", () => {
    const measures = packageDimensionsOf({
      SELLER_PACKAGE_HEIGHT: "10 cm",
      SELLER_PACKAGE_WIDTH: "14,2",
      SELLER_PACKAGE_LENGTH: "20cm",
      SELLER_PACKAGE_WEIGHT: "450 g",
    });

    expect(measures).toEqual(dimensions);
  });

  it("is null when one measure is missing", () => {
    expect(
      packageDimensionsOf({
        SELLER_PACKAGE_HEIGHT: "10",
        SELLER_PACKAGE_WIDTH: "15",
        SELLER_PACKAGE_WEIGHT: "450",
      }),
    ).toBeNull();
  });

  it("is null when a measure is in the wrong unit", () => {
    expect(
      packageDimensionsOf({
        SELLER_PACKAGE_HEIGHT: "10",
        SELLER_PACKAGE_WIDTH: "15",
        SELLER_PACKAGE_LENGTH: "20",
        SELLER_PACKAGE_WEIGHT: "0,45 kg",
      }),
    ).toBeNull();
  });
});
