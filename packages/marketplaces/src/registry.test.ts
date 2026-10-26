import { describe, expect, it } from "vitest";
import { createConnectorRegistry } from "./registry.ts";

/** Legacy database identifiers must never reactivate an executable simulated adapter. */
describe("createConnectorRegistry", () => {
  it("keeps the retired marketplace unavailable regardless of old settings", async () => {
    const settings = { appUrl: "http://localhost:3000", mockWebhookSecret: "old-secret" };
    const registry = createConnectorRegistry({
      mercadoLivre: { clientId: undefined, clientSecret: undefined },
      ...settings,
    });
    expect(registry.mock.isConfigured()).toBe(false);
    await expect(
      registry.mock.exchangeCode({ code: "x", redirectUri: settings.appUrl }),
    ).rejects.toThrow(/ainda não está disponível/);
  });

  it("enables Mercado Livre only with real credentials", () => {
    expect(createConnectorRegistry({}).mercado_livre.isConfigured()).toBe(false);
    expect(
      createConnectorRegistry({
        mercadoLivre: { clientId: "client", clientSecret: "secret" },
      }).mercado_livre.isConfigured(),
    ).toBe(true);
  });
});
