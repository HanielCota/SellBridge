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

interface AllowanceItem {
  amount: string;
  label: string;
}

/**
 * "3" + "lojas conectadas", "20.000" + "anúncios": the number stands out on the plan card. Every
 * plan holds more than one of each, so the labels are always plural.
 */
export function planAllowance(plan: BillingPlan): {
  stores: AllowanceItem;
  listings: AllowanceItem;
} {
  return {
    stores: {
      amount: integer.format(plan.stores),
      label: "lojas conectadas",
    },
    listings: {
      amount: integer.format(plan.listings),
      label: "anúncios",
    },
  };
}

const CENTS_PER_REAL = 100;

/**
 * A monthly price split for display: whole reais big, cents small and only when there are any.
 *
 * @param priceCents - Price in cents. Must be a non-negative integer.
 */
export function priceParts(priceCents: number): { reais: string; cents: string | null } {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    throw new RangeError(`Invalid plan price in cents: ${priceCents}`);
  }
  const cents = priceCents % CENTS_PER_REAL;
  return {
    reais: integer.format(Math.floor(priceCents / CENTS_PER_REAL)),
    cents: cents === 0 ? null : `,${String(cents).padStart(2, "0")}`,
  };
}
