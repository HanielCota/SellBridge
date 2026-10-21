import { describe, expect, it, vi } from "vitest";

vi.mock("./environment.ts", () => ({
  environment: {
    APP_URL: "http://localhost:4850",
    MOCK_WEBHOOK_SECRET: "mock-webhook-secret-for-tests",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  },
}));

const { oauthAuthorizationUrl, oauthCallbackUrl } = await import("./marketplaces.ts");

const TRUSTED_ORIGIN = "http://127.0.0.1:4850";

describe("OAuth URLs of the simulated marketplace", () => {
  it("keeps consent and callback on the host the person signed in on", () => {
    const redirectUri = oauthCallbackUrl("mock", TRUSTED_ORIGIN);
    const consentPage = new URL(
      oauthAuthorizationUrl("mock", { state: "state-1", redirectUri }, TRUSTED_ORIGIN),
    );
    expect(redirectUri).toBe("http://127.0.0.1:4850/api/oauth/mock/callback");
    expect(consentPage.origin).toBe(TRUSTED_ORIGIN);
    expect(consentPage.pathname).toBe("/oauth/mock/autorizar");
    expect(consentPage.searchParams.get("state")).toBe("state-1");
    expect(consentPage.searchParams.get("redirect_uri")).toBe(redirectUri);
  });

  it("keeps the redirect URI registered on APP_URL for real marketplaces", () => {
    expect(oauthCallbackUrl("mercado_livre", TRUSTED_ORIGIN)).toBe(
      "http://localhost:4850/api/oauth/mercado_livre/callback",
    );
  });
});
