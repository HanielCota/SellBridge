import { createTestConnectorRegistry } from "@sellbridge/marketplaces/testing";
import { environment } from "../environment.ts";
import { startWorker } from "../runtime.ts";

if (process.env.NODE_ENV === "production") {
  throw new Error("Test adapters cannot start in production.");
}
const webhookSecret = process.env.E2E_MARKETPLACE_SECRET;
if (!webhookSecret) throw new Error("E2E_MARKETPLACE_SECRET is required.");

/**
 * The daily purchase address check never reaches the real Mercado Livre from the browser tests: it
 * hears "not found", so the stores keep the verdict the web server's stand-in gave them.
 */
async function refuseAccountAddressRead(): Promise<Response> {
  return Response.json({ message: "not_found", status: 404 }, { status: 404 });
}

await startWorker(
  createTestConnectorRegistry({
    appUrl: environment.APP_URL,
    webhookSecret,
    latencyMilliseconds: 150,
  }),
  { accountAddressFetch: refuseAccountAddressRead },
);
