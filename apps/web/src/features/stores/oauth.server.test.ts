import { conflictError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTenantRequest:
    vi.fn<() => Promise<{ tenantId: string; userId: string; impersonatedBy: string | null }>>(),
  createOAuthState: vi.fn<(database: unknown, input: unknown) => Promise<void>>(),
  consumeOAuthState: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  upsertStoreConnection: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  exchangeCode: vi.fn<(input: unknown) => Promise<unknown>>(),
}));

vi.mock("@/lib/server/tenant-session", () => ({
  requireTenantRequest: mocks.requireTenantRequest,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: { APP_URL: "https://sellbridge.test" },
}));
vi.mock("@/lib/server/marketplaces", () => ({
  connectors: { mock: { exchangeCode: mocks.exchangeCode } },
  oauthCallbackUrl: (marketplace: string) => `https://sellbridge.test/api/oauth/${marketplace}`,
  tokenCipher: { encrypt: (value: string) => `enc:${value}` },
}));
vi.mock("@/features/billing/stripe.server", () => ({ billingConfigured: () => false }));
vi.mock("@sellbridge/database/repositories", () => ({
  assertActiveSupplier: vi.fn<() => Promise<void>>(),
  findOnboardingProfile: vi.fn<() => Promise<unknown>>(),
  consumeOAuthState: mocks.consumeOAuthState,
  createOAuthState: mocks.createOAuthState,
  upsertStoreConnection: mocks.upsertStoreConnection,
}));

const { handleOAuthCallback, handleOAuthStart } = await import("./oauth.server");

const SHOP = { externalShopId: "ml-123", shopName: "Loja do Vendedor" };

function callbackRequest(): Request {
  return new Request("https://sellbridge.test/api/oauth/mock/callback?code=abc&state=state-1");
}

async function redirectedTo(): Promise<URL> {
  const response = await handleOAuthCallback(callbackRequest(), "mock");
  expect(response.status).toBe(302);
  return new URL(response.headers.get("location") ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireTenantRequest.mockResolvedValue({
    tenantId: "tenant-b",
    userId: "user-b",
    impersonatedBy: null,
  });
  mocks.consumeOAuthState.mockResolvedValue({ codeVerifier: null, supplierId: "supplier-1" });
  mocks.exchangeCode.mockResolvedValue({
    tokens: { accessToken: "access", refreshToken: "refresh", expiresAt: null },
    shop: SHOP,
  });
});

describe("OAuth callback", () => {
  it("saves the shop under the organization of the session, never another", async () => {
    mocks.upsertStoreConnection.mockResolvedValue({ id: "store-1" });
    const location = await redirectedTo();
    expect(location.pathname).toBe("/lojas");
    expect(location.searchParams.get("conectada")).toBe("store-1");
    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tenantId: "tenant-b", marketplace: "mock" }),
    );
    expect(mocks.upsertStoreConnection).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        tenantId: "tenant-b",
        externalShopId: "ml-123",
        supplierId: "supplier-1",
      }),
    );
  });

  it("sends the reseller back with a clear message when the shop belongs to another account", async () => {
    mocks.upsertStoreConnection.mockRejectedValue(
      conflictError("Esta loja já está conectada em outra conta do SellBridge."),
    );
    const location = await redirectedTo();
    expect(location.pathname).toBe("/lojas");
    expect(location.searchParams.get("erro")).toBe("shop_in_use");
    expect(location.searchParams.has("conectada")).toBe(false);
  });

  it("refuses a state issued to another organization without touching the marketplace", async () => {
    mocks.consumeOAuthState.mockResolvedValue(null);
    const location = await redirectedTo();
    expect(location.searchParams.get("erro")).toBe("expired");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.upsertStoreConnection).not.toHaveBeenCalled();
  });
});

describe("connecting a store while an admin uses the customer's account", () => {
  beforeEach(() => {
    mocks.requireTenantRequest.mockResolvedValue({
      tenantId: "tenant-b",
      userId: "user-b",
      impersonatedBy: "admin-1",
    });
  });

  it("sends the admin back before asking the marketplace for consent", async () => {
    const response = await handleOAuthStart(
      new Request("https://sellbridge.test/api/oauth/mock/start"),
      "mock",
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/lojas");
    expect(location.searchParams.get("erro")).toBe("impersonating");
    expect(mocks.createOAuthState).not.toHaveBeenCalled();
  });

  it("refuses a consent that comes back during the visit, without saving the shop", async () => {
    const location = await redirectedTo();
    expect(location.searchParams.get("erro")).toBe("impersonating");
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.upsertStoreConnection).not.toHaveBeenCalled();
  });
});
