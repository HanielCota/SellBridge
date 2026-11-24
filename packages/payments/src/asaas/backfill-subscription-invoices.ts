/**
 * Turns on the monthly fee's service invoice for subscriptions created before it was set up.
 * Run once in the web container after setting the ASAAS_INVOICE_* values:
 *   node --import tsx node_modules/@sellbridge/payments/src/asaas/backfill-subscription-invoices.ts
 * Safe to run again: subscriptions that already have invoice settings are skipped.
 */
import { createDatabase } from "@sellbridge/database/client";
import { installProblemRecorder } from "@sellbridge/database/problem-recorder";
import { listSubscribedBillingAccounts } from "@sellbridge/database/repositories";
import { parseEnvironment } from "@sellbridge/shared/environment";
import { logger } from "@sellbridge/shared/logger";
import { z } from "zod";
import { invoiceEnvironmentFields, invoiceServiceFrom } from "./invoice-config.ts";
import { asaasEnvironmentFields, asaasSettingsFrom } from "./settings.ts";
import { backfillSubscriptionInvoices } from "./subscription-invoice-setup.ts";
import { createAsaasBillingClient } from "./subscriptions.ts";

const backfillEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ...asaasEnvironmentFields,
  ...invoiceEnvironmentFields,
});

const environment = parseEnvironment(backfillEnvironmentSchema, process.env);
const settings = asaasSettingsFrom(environment);
if (settings === null) {
  throw new Error("ASAAS_API_KEY, ASAAS_WALLET_ID and ASAAS_WEBHOOK_TOKEN are required");
}
const setting = invoiceServiceFrom(environment);
if (setting.kind !== "on") {
  throw new Error(
    `Invoice settings are not ready (${setting.kind}); set the ASAAS_INVOICE_* values`,
  );
}
const database = createDatabase(environment.DATABASE_URL, { maxConnections: 2 });
const recorder = installProblemRecorder(database, { service: "web" });
const client = createAsaasBillingClient(
  { fetchImplementation: fetch, baseUrl: settings.apiUrl },
  settings.apiKey,
);
try {
  const accounts = await listSubscribedBillingAccounts(database);
  const counts = await backfillSubscriptionInvoices({ database, client, setting }, accounts);
  logger.info("billing.invoice_backfill_done", { accounts: accounts.length, ...counts });
} finally {
  await recorder.flush();
  recorder.stop();
  await database.$client.end();
}
