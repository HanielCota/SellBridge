import { describe, expect, it } from "vitest";
import { createConnectorRegistry } from "./registry.ts";

describe("createConnectorRegistry", () => {
  it("disables the simulated store when no mock webhook secret is set", () => {
    const registry = createConnectorRegistry({ appUrl: "http://localhost:3000" });
    expect(registry.mock.isConfigured()).toBe(false);
  });

  it("enables the simulated store with a mock webhook secret", () => {
    const registry = createConnectorRegistry({
      appUrl: "http://localhost:3000",
      mockWebhookSecret: "segredo-de-teste-123",
    });
    expect(registry.mock.isConfigured()).toBe(true);
  });
});
