import { createTestConnectorRegistry } from "@sellbridge/marketplaces/testing";
import { environment } from "../environment.ts";
import { startWorker } from "../runtime.ts";

if (process.env.NODE_ENV === "production") {
  throw new Error("Test adapters cannot start in production.");
}
const webhookSecret = process.env.E2E_MARKETPLACE_SECRET;
if (!webhookSecret) throw new Error("E2E_MARKETPLACE_SECRET is required.");
await startWorker(
  createTestConnectorRegistry({
    appUrl: environment.APP_URL,
    webhookSecret,
    latencyMilliseconds: 150,
  }),
);
