import {
  enableSubscriptionInvoices as enableInvoices,
  invoiceServiceFrom,
  type AsaasBillingClient,
  type InvoiceOutcome,
  type InvoiceTarget,
} from "@sellbridge/payments/asaas";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";

/**
 * Turns on the service invoice of a subscription's monthly fee with the accountant's values from
 * the environment. Never throws: a refusal is logged as an error.
 */
export async function enableSubscriptionInvoices(
  client: AsaasBillingClient,
  target: InvoiceTarget,
): Promise<InvoiceOutcome> {
  return enableInvoices({ database, client, setting: invoiceServiceFrom(environment) }, target);
}
