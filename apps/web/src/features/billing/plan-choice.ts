import { BILLING_PLANS, type BillingPlan } from "@sellbridge/shared/billing";

export interface BillingUsage {
  stores: number;
  listings: number;
}

const integer = new Intl.NumberFormat("pt-BR");

/** The smallest plan that holds what the account already uses; Elite when none does. */
export function recommendedPlan(usage: BillingUsage): BillingPlan {
  const fitting = BILLING_PLANS.find(
    (plan) => plan.stores >= usage.stores && plan.listings >= usage.listings,
  );
  return fitting ?? BILLING_PLANS.at(-1) ?? BILLING_PLANS[0];
}

function countLabel(amount: number, singular: string, plural: string): string {
  return `${integer.format(amount)} ${amount === 1 ? singular : plural}`;
}

/**
 * What changes when the account moves to a plan smaller than what it uses: nothing leaves the
 * air, but nothing new fits. Null when the plan holds everything.
 */
export function overLimitWarning(plan: BillingPlan, usage: BillingUsage): string | null {
  if (usage.stores > plan.stores) {
    return `Você tem ${countLabel(usage.stores, "loja", "lojas")}; o ${plan.name} permite ${integer.format(plan.stores)}. As atuais continuam, mas não dá para conectar novas.`;
  }
  if (usage.listings > plan.listings) {
    return `Você tem ${countLabel(usage.listings, "anúncio", "anúncios")}; o ${plan.name} permite ${integer.format(plan.listings)}. Os atuais continuam, mas não dá para publicar novos.`;
  }
  return null;
}

/** "3 lojas", "1.000 anúncios": what a plan holds, in the reseller's words. */
export function planAllowance(plan: BillingPlan): { stores: string; listings: string } {
  return {
    stores: countLabel(plan.stores, "loja conectada", "lojas conectadas"),
    listings: countLabel(plan.listings, "anúncio", "anúncios"),
  };
}
