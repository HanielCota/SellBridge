import { describe, expect, it, vi } from "vitest";
import { isMarketplaceAuthError, isRetryableError } from "../errors.ts";
import type { FetchLike } from "../http.ts";
import { readMercadoLivreAccountAddresses } from "./addresses.ts";
import {
  INACTIVE_ADDRESS,
  RESELLER_HOME_ADDRESS,
  SUPPLIER_WAREHOUSE_ADDRESS,
  SUPPLIER_WAREHOUSE_FOR_EVERYTHING,
} from "./fixtures/addresses.ts";

const store = { externalShopId: "770001234", accessToken: "test-token" };

function setup(response: Response) {
  const request = vi.fn<FetchLike>().mockResolvedValueOnce(response);
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

describe("readMercadoLivreAccountAddresses", () => {
  it("reads every address of the account with its roles", async () => {
    const { request, config } = setup(
      Response.json([SUPPLIER_WAREHOUSE_ADDRESS, RESELLER_HOME_ADDRESS]),
    );

    const addresses = await readMercadoLivreAccountAddresses(config, store);

    expect(addresses).toEqual([
      {
        zipCode: "30130110",
        street: "Avenida Afonso Pena",
        number: "1500",
        types: ["selling", "shipping"],
      },
      { zipCode: "01310100", street: "Rua Augusta", number: "200", types: ["buying"] },
    ]);
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://api.mercadolibre.com/users/770001234/addresses",
    );
  });

  it("keeps nothing but the CEP, street, number and roles", async () => {
    const { config } = setup(Response.json([RESELLER_HOME_ADDRESS]));

    const [address] = await readMercadoLivreAccountAddresses(config, store);

    expect(Object.keys(address ?? {}).toSorted()).toEqual(["number", "street", "types", "zipCode"]);
  });

  it("accepts a single address, as the guide's example shows it", async () => {
    const { config } = setup(Response.json(RESELLER_HOME_ADDRESS));

    const addresses = await readMercadoLivreAccountAddresses(config, store);

    expect(addresses).toHaveLength(1);
  });

  it("reads the Portuguese shipping and billing roles", async () => {
    const { config } = setup(Response.json([SUPPLIER_WAREHOUSE_FOR_EVERYTHING]));

    const [address] = await readMercadoLivreAccountAddresses(config, store);

    expect(address?.types).toEqual(["buying", "selling", "shipping", "billing"]);
  });

  it("leaves out inactive addresses and unknown roles", async () => {
    const unknownRole = {
      ...RESELLER_HOME_ADDRESS,
      types: ["pickup_point", "default_buying_address"],
    };
    const { config } = setup(Response.json([INACTIVE_ADDRESS, unknownRole]));

    const addresses = await readMercadoLivreAccountAddresses(config, store);

    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.types).toEqual(["buying"]);
  });

  it("reads an account with no address as an empty list", async () => {
    const { config } = setup(Response.json([]));

    const addresses = await readMercadoLivreAccountAddresses(config, store);

    expect(addresses).toEqual([]);
  });

  it("reads a numeric street number and a missing one", async () => {
    const numeric = { ...RESELLER_HOME_ADDRESS, street_number: 200 };
    const missing = { ...RESELLER_HOME_ADDRESS, street_number: null, zip_code: " " };
    const { config } = setup(Response.json([numeric, missing]));

    const addresses = await readMercadoLivreAccountAddresses(config, store);

    expect(addresses[0]?.number).toBe("200");
    expect(addresses[1]).toMatchObject({ number: null, zipCode: null });
  });

  it("fails as a permanent refusal when the app lacks the permission", async () => {
    const { config } = setup(
      Response.json(
        { message: "PA_UNAUTHORIZED_RESULT_FROM_POLICIES", error: "forbidden", status: 403 },
        { status: 403 },
      ),
    );

    const failure = await readMercadoLivreAccountAddresses(config, store).catch(
      (error: unknown) => error,
    );

    expect(isRetryableError(failure)).toBe(false);
  });

  it("fails as an access problem when the token was refused", async () => {
    const { config } = setup(
      Response.json({ message: "invalid_token", error: "invalid_grant" }, { status: 401 }),
    );

    const failure = await readMercadoLivreAccountAddresses(config, store).catch(
      (error: unknown) => error,
    );

    expect(isMarketplaceAuthError(failure)).toBe(true);
  });

  it("refuses an account id that is not a number before calling", async () => {
    const { request, config } = setup(Response.json([]));

    await expect(
      readMercadoLivreAccountAddresses(config, { ...store, externalShopId: "../orders" }),
    ).rejects.toThrow("Conta do Mercado Livre inválida");
    expect(request).not.toHaveBeenCalled();
  });
});
