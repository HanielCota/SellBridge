import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("./environment.ts", () => ({
  environment: {
    APP_URL: "http://localhost:4850",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    MERCADO_LIVRE_CLIENT_ID: "client-id",
    MERCADO_LIVRE_CLIENT_SECRET: "client-secret",
    SHOPEE_PARTNER_ID: "12345",
    SHOPEE_PARTNER_KEY: "test-shopee-key",
  },
}));

const { connectors, oauthAuthorizationUrl, oauthCallbackUrl } = await import("./marketplaces.ts");

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

  it("passes the registered Shopee push URL and key to webhook verification", async () => {
    const rawBody = JSON.stringify({
      code: 3,
      shop_id: 45678,
      timestamp: 1000,
      data: { ordersn: "261126EXAMPLE", status: "READY_TO_SHIP" },
    });
    const signature = createHmac("sha256", "test-shopee-key")
      .update(`http://localhost:4850/api/webhooks/shopee|${rawBody}`)
      .digest("hex");

    await expect(
      connectors.shopee.verifyWebhook({
        rawBody,
        headers: new Headers({ authorization: signature }),
      }),
    ).resolves.toMatchObject({ valid: true, event: { resource: "261126EXAMPLE" } });
  });
});
