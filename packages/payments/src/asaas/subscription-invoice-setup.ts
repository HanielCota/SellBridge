import type { Database } from "@sellbridge/database/client";
import {
  findBillingHolder,
  findBillingOwnerEmail,
  tryLockSubscriptionInvoices,
} from "@sellbridge/database/repositories";
import { billingPlan, isBillingPlanId } from "@sellbridge/shared/billing";
import { logger } from "@sellbridge/shared/logger";
import { isAsaasError } from "./http.ts";
import type { InvoiceServiceSetting } from "./invoice-config.ts";
import { asaasDueDate } from "./money.ts";
import type { AsaasInvoiceService, AsaasSubscriberContact } from "./subscription-invoices.ts";
import { isPaidCharge } from "./subscription-state.ts";
import type { AsaasBillingClient, AsaasSubscriptionCharge } from "./subscriptions.ts";

/** The subscription whose monthly fee gets a service invoice, and the plan it charges. */
export interface InvoiceTarget {
  readonly tenantId: string;
  readonly subscriptionId: string;
  /** The Asaas customer; null leaves its contact as Asaas has it. */
  readonly customerId: string | null;
  readonly planId: string;
}

export interface InvoiceSetupContext {
  readonly database: Database;
  readonly client: AsaasBillingClient;
  readonly setting: InvoiceServiceSetting;
}

export type InvoiceOutcome = "off" | "invalid_config" | "busy" | "enabled" | "failed";

/** What the invoice says the service was: the plan, so the reseller and the accountant see it. */
export function invoiceDescription(planId: string): string {
  if (!isBillingPlanId(planId)) return "Assinatura SellBridge";
  return `Assinatura SellBridge, plano ${billingPlan(planId).name}`;
}

/** Paid charges with no invoice at all; a cancelled invoice counts, so it is never redone. */
export function chargesWithoutInvoice(
  charges: readonly AsaasSubscriptionCharge[],
  invoicedChargeIds: ReadonlySet<string>,
): AsaasSubscriptionCharge[] {
  return charges.filter((charge) => isPaidCharge(charge) && !invoicedChargeIds.has(charge.id));
}

/** Asaas refuses the settings while its customer lacks e-mail, street address or CEP. */
async function contactOf(
  database: Database,
  tenantId: string,
): Promise<AsaasSubscriberContact | null> {
  const [holder, email] = await Promise.all([
    findBillingHolder(database, tenantId),
    findBillingOwnerEmail(database, tenantId),
  ]);
  if (holder?.address == null || email === null) return null;
  const { address } = holder;
  return {
    email,
    address: address.street,
    addressNumber: address.number,
    complement: address.complement,
    province: address.neighborhood,
    postalCode: address.cep,
  };
}

async function scheduleMissingInvoices(
  client: AsaasBillingClient,
  service: AsaasInvoiceService,
  target: InvoiceTarget,
): Promise<number> {
  const [charges, invoices] = await Promise.all([
    client.listSubscriptionCharges(target.subscriptionId),
    client.listSubscriptionInvoices(target.subscriptionId),
  ]);
  const invoiced = new Set(invoices.flatMap((invoice) => invoice.payment ?? []));
  const missing = chargesWithoutInvoice(charges, invoiced);
  const today = asaasDueDate(new Date(), 0);
  for (const charge of missing) {
    // One at a time: a refusal stops before more invoices go out on the same bad data.
    await client.scheduleChargeInvoice(service, {
      chargeId: charge.id,
      value: charge.value,
      effectiveDate: today,
      description: invoiceDescription(target.planId),
    });
  }
  return missing.length;
}

/**
 * Sets the subscription's automatic invoice (issued when each payment is confirmed). Charges
 * paid before it had settings get no invoice from them, so those are scheduled here, but only
 * the first time: once the settings exist, Asaas issues the rest itself.
 */
async function applyInvoiceSettings(
  context: InvoiceSetupContext,
  service: AsaasInvoiceService,
  target: InvoiceTarget,
): Promise<number> {
  const { client, database } = context;
  const existing = await client.getSubscriptionInvoiceSettings(target.subscriptionId);
  const contact = target.customerId === null ? null : await contactOf(database, target.tenantId);
  if (target.customerId !== null && contact !== null) {
    await client.updateSubscriberContact(target.customerId, contact);
  }
  await client.saveSubscriptionInvoiceSettings(target.subscriptionId, {
    service,
    description: invoiceDescription(target.planId),
  });
  if (existing !== null) return 0;
  return scheduleMissingInvoices(client, service, target);
}

function reportFailure(target: InvoiceTarget, error: unknown): void {
  logger.error("billing.invoice_settings_failed", {
    problemKey: `invoice-settings:${target.subscriptionId}`,
    subscriptionId: target.subscriptionId,
    tenantId: target.tenantId,
    error,
    ...(isAsaasError(error)
      ? { status: error.status, codes: error.codes, issues: error.issues }
      : {}),
  });
}

/**
 * Turns on the service invoice (NFS-e) of a subscription's monthly fee. Never throws: the
 * subscription stands either way, and a refusal reaches the team as an error with Asaas's reason.
 * Off, with a warning, while the accountant's values are not set.
 */
export async function enableSubscriptionInvoices(
  context: InvoiceSetupContext,
  target: InvoiceTarget,
): Promise<InvoiceOutcome> {
  const { setting } = context;
  if (setting.kind === "off") {
    logger.warn("billing.invoice_not_configured", { subscriptionId: target.subscriptionId });
    return "off";
  }
  if (setting.kind === "invalid") {
    logger.error("billing.invoice_config_invalid", {
      problemKey: "invoice-config",
      problems: setting.problems,
    });
    return "invalid_config";
  }
  try {
    return await context.database.transaction(async (transaction) => {
      if (!(await tryLockSubscriptionInvoices(transaction, target.subscriptionId))) {
        logger.info("billing.invoice_settings_busy", { subscriptionId: target.subscriptionId });
        return "busy";
      }
      const scheduled = await applyInvoiceSettings(context, setting.service, target);
      logger.info("billing.invoice_settings_saved", {
        subscriptionId: target.subscriptionId,
        scheduled,
      });
      return "enabled";
    });
  } catch (error) {
    reportFailure(target, error);
    return "failed";
  }
}

/** A billing account bound to a subscription, as the one-off pass reads it. */
export interface SubscribedAccount {
  readonly tenantId: string;
  readonly subscriptionId: string | null;
  readonly plan: string;
}

export type BackfillOutcome = InvoiceOutcome | "already_set" | "not_active";

async function backfillOne(
  context: InvoiceSetupContext,
  account: SubscribedAccount & { readonly subscriptionId: string },
): Promise<BackfillOutcome> {
  const { client } = context;
  try {
    const subscription = await client.getSubscription(account.subscriptionId);
    if (subscription.deleted === true || subscription.status !== "ACTIVE") return "not_active";
    const existing = await client.getSubscriptionInvoiceSettings(subscription.id);
    if (existing !== null) return "already_set";
    return await enableSubscriptionInvoices(context, {
      tenantId: account.tenantId,
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      planId: account.plan,
    });
  } catch (error) {
    reportFailure({ ...account, customerId: null, planId: account.plan }, error);
    return "failed";
  }
}

/**
 * The one-off pass for subscriptions created before the invoice was turned on: each active one
 * without settings gets them, and its charges already paid get their invoice. Safe to run again:
 * subscriptions that have settings are left alone. One at a time, to stay gentle with Asaas.
 */
export async function backfillSubscriptionInvoices(
  context: InvoiceSetupContext,
  accounts: readonly SubscribedAccount[],
): Promise<Partial<Record<BackfillOutcome, number>>> {
  const counts: Partial<Record<BackfillOutcome, number>> = {};
  for (const account of accounts) {
    const { subscriptionId } = account;
    if (subscriptionId === null) continue;
    const outcome = await backfillOne(context, { ...account, subscriptionId });
    counts[outcome] = (counts[outcome] ?? 0) + 1;
    if (outcome === "off" || outcome === "invalid_config") break;
  }
  return counts;
}
