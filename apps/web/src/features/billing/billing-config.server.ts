import {
  asaasSettingsFrom,
  createAsaasBillingClient,
  type AsaasBillingClient,
} from "@sellbridge/payments/asaas";
import type { BillingRules, BillingTransition } from "@sellbridge/shared/billing";
import { validationError } from "@sellbridge/shared/errors";
import { environment } from "@/lib/server/environment";

function billingTransition(): BillingTransition | null {
  const { BILLING_LAUNCHED_AT: launchedAt, BILLING_TRANSITION_ENDS_AT: endsAt } = environment;
  if (launchedAt === undefined || endsAt === undefined) return null;
  return { launchedAt: new Date(launchedAt), endsAt: new Date(endsAt) };
}

/**
 * Plans are charged once SellBridge's Asaas account and the launch dates are set, unless
 * BILLING_UNLIMITED holds them off. The Asaas keys alone are not enough: suppliers' protected
 * payments use them too, long before the plans start.
 */
export function billingEnabled(): boolean {
  return (
    !environment.BILLING_UNLIMITED &&
    asaasSettingsFrom(environment) !== null &&
    billingTransition() !== null
  );
}

/** The plan limits to enforce, or null while billing is off (no limits at all). */
export function billingRules(): BillingRules | null {
  if (!billingEnabled()) return null;
  return { transition: billingTransition() };
}

/** SellBridge's own Asaas account, where the monthly fee is charged. */
export function billingClient(): AsaasBillingClient {
  const settings = asaasSettingsFrom(environment);
  if (settings === null || !billingEnabled()) {
    throw validationError("A cobrança dos planos ainda não começou");
  }
  return createAsaasBillingClient(
    { fetchImplementation: fetch, baseUrl: settings.apiUrl },
    settings.apiKey,
  );
}

/** The Asaas account even with the plans held off: a deleted account must stop being charged. */
export function billingClientForCleanup(): AsaasBillingClient | null {
  const settings = asaasSettingsFrom(environment);
  if (settings === null) return null;
  return createAsaasBillingClient(
    { fetchImplementation: fetch, baseUrl: settings.apiUrl },
    settings.apiKey,
  );
}
