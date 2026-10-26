import { describe, expect, it, vi } from "vitest";

vi.mock("./environment.ts", () => ({
  environment: {
    APP_URL: "http://localhost:4850",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    MERCADO_LIVRE_CLIENT_ID: "client-id",
    MERCADO_LIVRE_CLIENT_SECRET: "client-secret",
  },
}));

const { oauthAuthorizationUrl, oauthCallbackUrl } = await import("./marketplaces.ts");

describe("marketplace OAuth URLs", () => {
  it("keeps the callback on the registered APP_URL", () => {
    const redirectUri = oauthCallbackUrl("mercado_livre");
    expect(redirectUri).toBe("http://localhost:4850/api/oauth/mercado_livre/callback");
    const consent = new URL(
      oauthAuthorizationUrl("mercado_livre", { state: "state-1", redirectUri }),
    );
    expect(consent.origin).toBe("https://auth.mercadolivre.com.br");
    expect(consent.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(consent.searchParams.get("state")).toBe("state-1");
  });
});
