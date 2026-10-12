export const BILLING_PLANS = [
  { id: "free", name: "Gratuito", stores: 2, listings: 25 },
  { id: "pro", name: "Pro", stores: 10, listings: 500 },
  { id: "business", name: "Business", stores: 50, listings: 5000 },
] as const;

export type BillingPlanId = (typeof BILLING_PLANS)[number]["id"];

export function effectiveBillingPlan(
  subscription: {
    plan: string;
    status: string;
    periodEnd: Date | null;
  } | null,
  now = new Date(),
) {
  const paid =
    subscription &&
    ["active", "trialing"].includes(subscription.status) &&
    subscription.periodEnd &&
    subscription.periodEnd > now;
  return (
    BILLING_PLANS.find((plan) => plan.id === (paid ? subscription.plan : "free")) ??
    BILLING_PLANS[0]
  );
}
