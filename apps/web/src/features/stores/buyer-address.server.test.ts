import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkStoreBuyerAddress:
    vi.fn<
      (
        database: unknown,
        check: { storeConnectionId: string; readAddresses: () => Promise<unknown> },
      ) => Promise<string>
    >(),
  findBuyerAddressCheckTarget: vi.fn<
    (
      database: unknown,
      tenantId: string,
      storeConnectionId: string,
    ) => Promise<{
      id: string;
      externalShopId: string;
      accessTokenEnc: string;
      lastCheck: { result: string; checkedAt: Date } | null;
    } | null>
  >(),
  readMercadoLivreAccountAddresses: vi.fn<(config: unknown, store: unknown) => Promise<unknown>>(),
}));

vi.mock("@sellbridge/database/repositories", () => ({
  checkStoreBuyerAddress: mocks.checkStoreBuyerAddress,
  findBuyerAddressCheckTarget: mocks.findBuyerAddressCheckTarget,
}));
vi.mock("@sellbridge/marketplaces", () => ({
  readMercadoLivreAccountAddresses: mocks.readMercadoLivreAccountAddresses,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({
  mercadoLivreApiConfig: { clientId: "client" },
  tokenCipher: { decrypt: (value: string) => value.replace("enc:", "") },
}));

const { checkBuyerAddressAfterConnect, recheckBuyerAddressForTenant } =
  await import("./buyer-address.server");

const credentials = { externalShopId: "770001234", accessToken: "fresh" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readMercadoLivreAccountAddresses.mockResolvedValue([]);
  mocks.checkStoreBuyerAddress.mockImplementation(async (_database, check) => {
    await check.readAddresses();
    return "ok";
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkBuyerAddressAfterConnect", () => {
  it("reads the new Mercado Livre store's addresses with the fresh token", async () => {
    await checkBuyerAddressAfterConnect(
      { id: "store-1", marketplace: "mercado_livre" },
      credentials,
    );

    expect(mocks.checkStoreBuyerAddress).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ storeConnectionId: "store-1" }),
    );
    expect(mocks.readMercadoLivreAccountAddresses).toHaveBeenCalledWith(
      { clientId: "client" },
      credentials,
    );
  });

  it("leaves other marketplaces alone", async () => {
    await checkBuyerAddressAfterConnect({ id: "store-1", marketplace: "tiktok_shop" }, credentials);

    expect(mocks.checkStoreBuyerAddress).not.toHaveBeenCalled();
  });

  it("never fails the connection when the check fails", async () => {
    mocks.checkStoreBuyerAddress.mockRejectedValue(new Error("banco fora do ar"));

    await expect(
      checkBuyerAddressAfterConnect({ id: "store-1", marketplace: "mercado_livre" }, credentials),
    ).resolves.toBeUndefined();
  });

  it("stops waiting for a slow check so the store shows up", async () => {
    vi.useFakeTimers();
    mocks.checkStoreBuyerAddress.mockImplementation(async () => new Promise(() => undefined));

    const done = checkBuyerAddressAfterConnect(
      { id: "store-1", marketplace: "mercado_livre" },
      credentials,
    );
    await vi.advanceTimersByTimeAsync(5000);

    await expect(done).resolves.toBeUndefined();
  });
});

describe("recheckBuyerAddressForTenant", () => {
  it("reads the tenant's store with its saved token and returns the verdict", async () => {
    mocks.findBuyerAddressCheckTarget.mockResolvedValue({
      id: "store-1",
      externalShopId: "770001234",
      accessTokenEnc: "enc:saved",
      lastCheck: { result: "ok", checkedAt: new Date(Date.now() - 60_000) },
    });
    mocks.checkStoreBuyerAddress.mockImplementation(async (_database, check) => {
      await check.readAddresses();
      return "supplier_address";
    });

    const result = await recheckBuyerAddressForTenant("tenant-1", "store-1");

    expect(result).toBe("supplier_address");
    expect(mocks.findBuyerAddressCheckTarget).toHaveBeenCalledWith({}, "tenant-1", "store-1");
    expect(mocks.readMercadoLivreAccountAddresses).toHaveBeenCalledWith(
      { clientId: "client" },
      { externalShopId: "770001234", accessToken: "saved" },
    );
  });

  it("answers a click right after the last reading without asking Mercado Livre again", async () => {
    mocks.findBuyerAddressCheckTarget.mockResolvedValue({
      id: "store-1",
      externalShopId: "770001234",
      accessTokenEnc: "enc:saved",
      lastCheck: { result: "supplier_address", checkedAt: new Date(Date.now() - 2000) },
    });

    const result = await recheckBuyerAddressForTenant("tenant-1", "store-1");

    expect(result).toBe("supplier_address");
    expect(mocks.readMercadoLivreAccountAddresses).not.toHaveBeenCalled();
  });

  it("refuses a store that is not the tenant's connected Mercado Livre store", async () => {
    mocks.findBuyerAddressCheckTarget.mockResolvedValue(null);

    await expect(recheckBuyerAddressForTenant("tenant-1", "store-2")).rejects.toThrow(
      "Loja do Mercado Livre não encontrada ou desconectada",
    );
    expect(mocks.checkStoreBuyerAddress).not.toHaveBeenCalled();
  });
});
