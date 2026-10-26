import { createConnectorRegistry } from "../registry.ts";
import type { AuthorizationRequest } from "../types.ts";
import { createMockConnector } from "./mock-connector.ts";

/** Test-only adapters: neither the web build nor the production worker imports this module. */
export function createTestConnectorRegistry(config: {
  appUrl: string;
  webhookSecret: string;
  latencyMilliseconds?: number;
}) {
  const fixture = createMockConnector(config);
  return {
    ...createConnectorRegistry({}),
    mock: fixture,
    mercado_livre: {
      ...fixture,
      id: "mercado_livre" as const,
      displayName: "Mercado Livre",
      async publishProduct(...args: Parameters<typeof fixture.publishProduct>) {
        const result = await fixture.publishProduct(...args);
        return {
          ...result,
          externalUrl: new URL(`/__e2e/listing/${result.externalId}`, config.appUrl).href,
        };
      },
      getAuthorizationUrl(request: AuthorizationRequest) {
        const url = new URL("/__e2e/consent", config.appUrl);
        url.searchParams.set("state", request.state);
        url.searchParams.set("redirect_uri", request.redirectUri);
        return url.toString();
      },
    },
  };
}
