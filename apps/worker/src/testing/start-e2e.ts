import { createTestConnectorRegistry } from "@sellbridge/marketplaces/testing";

if (process.env.NODE_ENV === "production") {
  throw new Error("Test adapters cannot start in production.");
}
const webhookSecret = process.env.E2E_MARKETPLACE_SECRET;
if (!webhookSecret) throw new Error("E2E_MARKETPLACE_SECRET is required.");
// The CNPJ query goes to the test site's stand-in, never to BrasilAPI. Set before the
// environment module reads it, hence the dynamic imports below.
const appUrl = process.env.APP_URL;
if (appUrl === undefined) throw new Error("APP_URL is required.");
process.env.CNPJ_LOOKUP_URL = new URL("/__e2e/cnpj/v1", appUrl).href;
const { environment } = await import("../environment.ts");
const { startWorker } = await import("../runtime.ts");
await startWorker(
  createTestConnectorRegistry({
    appUrl: environment.APP_URL,
    webhookSecret,
    latencyMilliseconds: 150,
  }),
);
