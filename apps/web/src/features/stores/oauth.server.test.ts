import { conflictError, unauthorizedError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSellerSession:
    vi.fn<() => Promise<{ tenantId: string; userId: string; impersonatedBy: string | null }>>(),
  createOAuthState: vi.fn<(database: unknown, input: unknown) => Promise<void>>(),
  consumeOAuthState: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  upsertStoreConnection: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  exchangeCode: vi.fn<(input: unknown) => Promise<unknown>>(),
  isUserEmailVerified: vi.fn<(database: unknown, userId: string) => Promise<boolean>>(),
  hasLiveStoreConnection: vi.fn<(database: unknown, input: unknown) => Promise<boolean>>(),
}));

vi.mock("@/lib/server/tenant-session", () => ({
  requireSellerSession: mocks.requireSellerSession,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "https://sellbridge.test",
    BETTER_AUTH_TRUSTED_ORIGINS: ["http://127.0.0.1:4850"],
  },
}));
vi.mock("@/lib/server/marketplaces", () => ({
  connectors: { mock: { exchangeCode: mocks.exchangeCode } },
  oauthCallbackUrl: (marketplace: string, origin: string) =>
    `${origin}/api/oauth/${marketplace}/callback`,
  oauthAuthorizationUrl: (_marketplace: string, request: { state: string }, origin: string) =>
    `${origin}/oauth/mock/autorizar?state=${request.state}`,
  tokenCipher: { encrypt: (value: string) => `enc:${value}` },
}));
vi.mock("@/features/billing/stripe.server", () => ({ billingConfigured: () => false }));
vi.mock("@sellbridge/database/repositories", () => ({
  assertActiveSupplier: vi.fn<() => Promise<void>>(),
  findOnboardingProfile: vi.fn<() => Promise<unknown>>(),
  consumeOAuthState: mocks.consumeOAuthState,
  createOAuthState: mocks.createOAuthState,
  upsertStoreConnection: mocks.upsertStoreConnection,
  isUserEmailVerified: mocks.isUserEmailVerified,
  hasLiveStoreConnection: mocks.hasLiveStoreConnection,
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
  mocks.requireSellerSession.mockResolvedValue({
    tenantId: "tenant-b",
    userId: "user-b",
    impersonatedBy: null,
  });
  mocks.consumeOAuthState.mockResolvedValue({ codeVerifier: null, supplierId: "supplier-1" });
  mocks.isUserEmailVerified.mockResolvedValue(true);
  mocks.hasLiveStoreConnection.mockResolvedValue(false);
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
    mocks.requireSellerSession.mockResolvedValue({
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

describe("redirects on a trusted host other than APP_URL", () => {
  it("keeps the person on the host their session cookie belongs to", async () => {
    mocks.requireSellerSession.mockResolvedValue({
      tenantId: "tenant-b",
      userId: "user-b",
      impersonatedBy: "admin-1",
    });
    const response = await handleOAuthStart(
      new Request("http://127.0.0.1:4850/api/oauth/mock/start"),
      "mock",
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("http://127.0.0.1:4850");
    expect(location.pathname).toBe("/lojas");
  });

  it("never follows a host that is not trusted", async () => {
    mocks.requireSellerSession.mockRejectedValue(unauthorizedError());
    const response = await handleOAuthStart(
      new Request("http://evil.example/api/oauth/mock/start"),
      "mock",
    );
    expect(new URL(response.headers.get("location") ?? "").origin).toBe("https://sellbridge.test");
  });
});

// Item 26.b (L1): a store is only connected by someone whose e-mail is confirmed.
describe("verified e-mail before a new store", () => {
  it("refuses a new shop while the e-mail is not confirmed, without saving it", async () => {
    mocks.isUserEmailVerified.mockResolvedValue(false);
    const location = await redirectedTo();
    expect(location.pathname).toBe("/lojas");
    expect(location.searchParams.get("erro")).toBe("email_not_verified");
    expect(mocks.isUserEmailVerified).toHaveBeenCalledWith({}, "user-b");
    expect(mocks.upsertStoreConnection).not.toHaveBeenCalled();
  });

  it("still reconnects a shop the account already has", async () => {
    mocks.isUserEmailVerified.mockResolvedValue(false);
    mocks.hasLiveStoreConnection.mockResolvedValue(true);
    mocks.upsertStoreConnection.mockResolvedValue({ id: "store-1" });
    const location = await redirectedTo();
    expect(location.searchParams.get("conectada")).toBe("store-1");
    expect(mocks.hasLiveStoreConnection).toHaveBeenCalledWith(
      {},
      { tenantId: "tenant-b", marketplace: "mock", externalShopId: SHOP.externalShopId },
    );
  });
});
