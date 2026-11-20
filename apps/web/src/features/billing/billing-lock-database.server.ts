import { createDatabase, type Database } from "@sellbridge/database/client";
import { environment } from "@/lib/server/environment";

declare global {
  var sellbridgeBillingLockDatabase: Database | undefined;
}

let productionPool: Database | undefined;

/** Held locks must not exhaust the pool used to persist a provider operation. */
export function billingLockDatabase(): Database {
  const existing = productionPool ?? globalThis.sellbridgeBillingLockDatabase;
  if (existing !== undefined) {
    return existing;
  }

  const created = createDatabase(environment.DATABASE_URL, {
    maxConnections: 2,
    applicationName: "sellbridge-billing-lock",
  });

  if (environment.NODE_ENV === "production") {
    productionPool = created;
    return created;
  }

  globalThis.sellbridgeBillingLockDatabase = created;
  return created;
}
