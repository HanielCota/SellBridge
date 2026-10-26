import { conflictError, unauthorizedError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSellerRequest:
    vi.fn<
      (
        request: Request,
      ) => Promise<{ tenantId: string; userId: string; impersonatedBy: string | null }>
    >(),
  findOAuthStateProfile: vi.fn<() => Promise<string | null>>(),
  createOAuthState: vi.fn<(database: unknown, input: unknown) => Promise<void>>(),
  consumeOAuthState: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  upsertStoreConnection: vi.fn<(database: unknown, input: unknown) => Promise<unknown>>(),
  exchangeCode: vi.fn<(input: unknown) => Promise<unknown>>(),
  isUserEmailVerified: vi.fn<(database: unknown, userId: string) => Promise<boolean>>(),
  hasLiveStoreConnection: vi.fn<(database: unknown, input: unknown) => Promise<boolean>>(),
  findStoreAwaitingReconnection:
    vi.fn<(...args: unknown[]) => Promise<{ id: string; connectedAt: Date } | null>>(),
  enqueueStoreOrderCatchUp: vi.fn<(job: unknown) => Promise<void>>(),
}));

vi.mock("@/lib/server/tenant-session", () => ({
  requireSellerRequest: mocks.requireSellerRequest,
}));
vi.mock("@/lib/server/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "user-b" } }) } },
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({
  environment: {
    APP_URL: "https://sellbridge.test",
    BETTER_AUTH_TRUSTED_ORIGINS: ["http://127.0.0.1:4850"],
  },
}));
vi.mock("@/lib/server/marketplaces", () => ({
  connectors: { mercado_livre: { exchangeCode: mocks.exchangeCode } },
  oauthCallbackUrl: (marketplace: string) =>
    `https://sellbridge.test/api/oauth/${marketplace}/callback`,
  oauthAuthorizationUrl: (_marketplace: string, request: { state: string }) =>
    `https://auth.mercadolivre.com.br/authorization?state=${request.state}`,
  tokenCipher: { encrypt: (value: string) => `enc:${value}` },
}));
vi.mock("@/features/billing/stripe.server", () => ({ billingConfigured: () => false }));
vi.mock("@sellbridge/database/repositories", () => ({
  assertActiveSupplier: vi.fn<() => Promise<void>>(),
  findOnboardingProfile: vi.fn<() => Promise<unknown>>(),
  consumeOAuthState: mocks.consumeOAuthState,
  findOAuthStateProfile: mocks.findOAuthStateProfile,
  createOAuthState: mocks.createOAuthState,
  upsertStoreConnection: mocks.upsertStoreConnection,
  isUserEmailVerified: mocks.isUserEmailVerified,
  hasLiveStoreConnection: mocks.hasLiveStoreConnection,
  findStoreAwaitingReconnection: mocks.findStoreAwaitingReconnection,
}));
vi.mock("@/lib/server/queues", () => ({
  enqueueStoreOrderCatchUp: mocks.enqueueStoreOrderCatchUp,
}));

const { handleOAuthCallback, handleOAuthStart, orderCatchUpSince } = await import("./oauth.server");

const SHOP = { externalShopId: "ml-123", shopName: "Loja do Vendedor" };

function callbackRequest(): Request {
  return new Request(
    "https://sellbridge.test/api/oauth/mercado_livre/callback?code=abc&state=state-1",
  );
}

async function redirectedTo(): Promise<URL> {
  const response = await handleOAuthCallback(callbackRequest(), "mercado_livre");
  expect(response.status).toBe(302);
  return new URL(response.headers.get("location") ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOAuthStateProfile.mockResolvedValue(null);
  mocks.requireSellerRequest.mockResolvedValue({
    tenantId: "tenant-b",
    userId: "user-b",
    impersonatedBy: null,
  });
  mocks.consumeOAuthState.mockResolvedValue({ codeVerifier: null, supplierId: "supplier-1" });
  mocks.isUserEmailVerified.mockResolvedValue(true);
  mocks.hasLiveStoreConnection.mockResolvedValue(false);
  mocks.findStoreAwaitingReconnection.mockResolvedValue(null);
  mocks.enqueueStoreOrderCatchUp.mockResolvedValue(undefined);
  mocks.exchangeCode.mockResolvedValue({
    tokens: { accessToken: "access", refreshToken: "refresh", expiresAt: null },
    shop: SHOP,
  });
});

describe("OAuth callback", () => {
  it("recovers the transaction profile and returns to it after a callback without a profile parameter", async () => {
    mocks.findOAuthStateProfile.mockResolvedValue("second-profile");
    mocks.upsertStoreConnection.mockResolvedValue({ id: "store-1" });
    const location = await redirectedTo();
    expect(location.searchParams.get("perfil")).toBe("second-profile");
    const request = mocks.requireSellerRequest.mock.calls.at(-1)?.[0];
    expect(request).toBeInstanceOf(Request);
    expect(new URL(request?.url ?? "https://missing.example").searchParams.get("perfil")).toBe(
      "second-profile",
    );
    expect(mocks.findOAuthStateProfile).toHaveBeenCalledWith(
      {},
      {
        state: "state-1",
        marketplace: "mercado_livre",
        userId: "user-b",
      },
    );
  });

  it("saves the shop under the organization of the session, never another", async () => {
    mocks.upsertStoreConnection.mockResolvedValue({ id: "store-1" });
    const location = await redirectedTo();
    expect(location.pathname).toBe("/lojas");
    expect(location.searchParams.get("conectada")).toBe("store-1");
    expect(mocks.consumeOAuthState).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ tenantId: "tenant-b", marketplace: "mercado_livre" }),
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
    mocks.requireSellerRequest.mockResolvedValue({
      tenantId: "tenant-b",
      userId: "user-b",
      impersonatedBy: "admin-1",
    });
  });

  it("sends the admin back before asking the marketplace for consent", async () => {
    const response = await handleOAuthStart(
      new Request("https://sellbridge.test/api/oauth/mercado_livre/start"),
      "mercado_livre",
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
    mocks.requireSellerRequest.mockResolvedValue({
      tenantId: "tenant-b",
      userId: "user-b",
      impersonatedBy: "admin-1",
    });
    const response = await handleOAuthStart(
      new Request("http://127.0.0.1:4850/api/oauth/mercado_livre/start"),
      "mercado_livre",
    );
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("http://127.0.0.1:4850");
    expect(location.pathname).toBe("/lojas");
  });

  it("never follows a host that is not trusted", async () => {
    mocks.requireSellerRequest.mockRejectedValue(unauthorizedError());
    const response = await handleOAuthStart(
      new Request("http://evil.example/api/oauth/mercado_livre/start"),
      "mercado_livre",
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
      { tenantId: "tenant-b", marketplace: "mercado_livre", externalShopId: SHOP.externalShopId },
    );
  });
});

it("refuses the retired mock callback without exchanging a code", async () => {
  const response = await handleOAuthCallback(callbackRequest(), "mock");
  expect(new URL(response.headers.get("location") ?? "").searchParams.get("erro")).toBe(
    "unknown_marketplace",
  );
  expect(mocks.exchangeCode).not.toHaveBeenCalled();
});

// Regression (security audit, 26/10/2026): notifications about a store without access waited for
// the reconnection unprocessed, so forged ones piled up for good; they are now closed on arrival
// and the reconnection reads the store's sales from the marketplace instead.
describe("reconnecting a store that lost its access", () => {
  it("asks the worker to read its sales since it was first connected, within a month", async () => {
    const firstConnectedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    mocks.findStoreAwaitingReconnection.mockResolvedValue({
      id: "store-1",
      connectedAt: firstConnectedAt,
    });
    mocks.upsertStoreConnection.mockResolvedValue({ id: "store-1" });
    const location = await redirectedTo();
    expect(location.searchParams.get("conectada")).toBe("store-1");
    expect(mocks.enqueueStoreOrderCatchUp).toHaveBeenCalledWith({
      storeConnectionId: "store-1",
      since: firstConnectedAt.toISOString(),
    });
  });

  it("reads nothing for a shop connected for the first time", async () => {
    mocks.upsertStoreConnection.mockResolvedValue({ id: "store-1" });
    await redirectedTo();
    expect(mocks.enqueueStoreOrderCatchUp).not.toHaveBeenCalled();
  });

  it("keeps the store connected when the request to read its sales fails", async () => {
    mocks.findStoreAwaitingReconnection.mockResolvedValue({
      id: "store-1",
      connectedAt: new Date(),
    });
    mocks.upsertStoreConnection.mockResolvedValue({ id: "store-1" });
    mocks.enqueueStoreOrderCatchUp.mockRejectedValue(new Error("Redis fora do ar"));
    const location = await redirectedTo();
    expect(location.searchParams.get("conectada")).toBe("store-1");
  });

  it("never reads further back than a month, nor before the first connection", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    const longAgo = new Date("2025-01-01T00:00:00Z");
    const lastWeek = new Date("2026-10-19T12:00:00Z");
    expect(orderCatchUpSince(longAgo, now)).toEqual(new Date("2026-09-26T12:00:00Z"));
    expect(orderCatchUpSince(lastWeek, now)).toEqual(lastWeek);
  });
});
