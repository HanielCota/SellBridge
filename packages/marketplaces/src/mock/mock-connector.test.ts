import { describe, expect, it } from "vitest";
import {
  createMockConnector,
  encodeMockAuthorizationCode,
  MOCK_REVOKED_REFRESH_TOKEN,
  MOCK_SIGNATURE_HEADER,
  signMockWebhook,
} from "./mock-connector.ts";

const connector = createMockConnector({
  appUrl: "http://localhost:3000",
  webhookSecret: "segredo-de-teste",
  latencyMilliseconds: 0,
  now: () => new Date("2026-01-01T00:00:00Z"),
});

async function connect(shopName = "Minha Loja") {
  return connector.exchangeCode({
    code: encodeMockAuthorizationCode(shopName),
    redirectUri: "http://localhost:3000/api/oauth/mock/callback",
  });
}

const baseProduct = {
  idempotencyKey: "listing-1:store-1",
  title: "Camiseta básica",
  description: "Algodão",
  priceCents: 4990,
  stock: 10,
  sku: "SKU-1",
  imageUrls: [],
};

describe("mock connector OAuth", () => {
  it("builds the consent URL with state and redirect", () => {
    const url = new URL(
      connector.getAuthorizationUrl({ state: "abc", redirectUri: "http://localhost:3000/cb" }),
    );
    expect(url.pathname).toBe("/oauth/mock/autorizar");
    expect(url.searchParams.get("state")).toBe("abc");
  });

  it("exchanges a consent code for tokens and shop", async () => {
    const result = await connect("Loja da Ana");
    expect(result.shop.shopName).toBe("Loja da Ana");
    expect(result.tokens.accessToken).toMatch(/^mock-access-/);
    expect(result.tokens.expiresAt?.toISOString()).toBe("2026-01-01T06:00:00.000Z");
  });

  it("gives each connection its own shop id even with the same name", async () => {
    const first = await connect("Igual");
    const second = await connect("Igual");
    expect(first.shop.externalShopId).not.toBe(second.shop.externalShopId);
  });

  it("rejects invalid codes", async () => {
    await expect(connector.exchangeCode({ code: "abc", redirectUri: "x" })).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER",
    });
  });

  it("refreshes tokens and reports revoked refresh tokens", async () => {
    const { tokens } = await connect();
    const refreshed = await connector.refreshTokens(tokens.refreshToken ?? "");
    expect(refreshed.accessToken).not.toBe(tokens.accessToken);
    await expect(connector.refreshTokens(MOCK_REVOKED_REFRESH_TOKEN)).rejects.toMatchObject({
      code: "EXTERNAL_PROVIDER_AUTH",
    });
  });
});

describe("mock connector publishing", () => {
  const credentials = { externalShopId: "shop-1", accessToken: "mock-access-ok" };

  it("publishes idempotently", async () => {
    const first = await connector.publishProduct(credentials, baseProduct);
    const second = await connector.publishProduct(credentials, baseProduct);
    expect(first.externalId).toBe(second.externalId);
  });

  it("rejects forbidden titles permanently", async () => {
    await expect(
      connector.publishProduct(credentials, { ...baseProduct, title: "Produto [falha]" }),
    ).rejects.toMatchObject({
      details: { retryable: false },
      message: expect.stringContaining("título"),
    });
  });

  it("signals temporary failures as retryable", async () => {
    await expect(
      connector.publishProduct(credentials, { ...baseProduct, title: "Produto [instavel]" }),
    ).rejects.toMatchObject({ details: { retryable: true } });
  });

  it("rejects prices below the minimum", async () => {
    await expect(
      connector.publishProduct(credentials, { ...baseProduct, priceCents: 499 }),
    ).rejects.toMatchObject({ details: { retryable: false } });
  });

  it("requires a valid access token", async () => {
    await expect(
      connector.publishProduct({ ...credentials, accessToken: "expired" }, baseProduct),
    ).rejects.toMatchObject({ code: "EXTERNAL_PROVIDER_AUTH" });
  });
});

describe("mock connector webhooks", () => {
  const body = JSON.stringify({
    id: "evt-1",
    topic: "orders",
    shopId: "shop-1",
    resource: "ORD-1",
  });

  it("accepts a correctly signed payload", async () => {
    const headers = new Headers({
      [MOCK_SIGNATURE_HEADER]: signMockWebhook(body, "segredo-de-teste"),
    });
    const result = await connector.verifyWebhook({ headers, rawBody: body });
    expect(result).toMatchObject({
      valid: true,
      event: { externalEventId: "evt-1", topic: "orders" },
    });
  });

  it("rejects missing and wrong signatures", async () => {
    expect(await connector.verifyWebhook({ headers: new Headers(), rawBody: body })).toMatchObject({
      valid: false,
      reason: "Assinatura ausente",
    });
    const headers = new Headers({ [MOCK_SIGNATURE_HEADER]: signMockWebhook(body, "outro") });
    expect(await connector.verifyWebhook({ headers, rawBody: body })).toMatchObject({
      valid: false,
      reason: "Assinatura inválida",
    });
  });

  it("rejects signed payloads with the wrong shape", async () => {
    const bad = JSON.stringify({ hello: "world" });
    const headers = new Headers({
      [MOCK_SIGNATURE_HEADER]: signMockWebhook(bad, "segredo-de-teste"),
    });
    expect(await connector.verifyWebhook({ headers, rawBody: bad })).toMatchObject({
      valid: false,
    });
  });
});
