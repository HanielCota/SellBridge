import { BILLING_PLANS, type BillingPlan, type BillingPlanId } from "@sellbridge/shared/billing";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { billingQueryOptions } from "@/features/billing/billing.queries";
import { errorMessage } from "@/lib/errors";

export { dateLabel, lastDayLabel } from "./billing-copy";

export function useBillingData() {
  return useSuspenseQuery(billingQueryOptions()).data;
}

export type BillingData = ReturnType<typeof useBillingData>;

export const OWNER_ONLY_REASON = "Só o dono da conta pode assinar ou mudar o plano";

export function planById(id: string | null | undefined): BillingPlan | null {
  return BILLING_PLANS.find((plan) => plan.id === id) ?? null;
}

export function currentPlanOf(data: BillingData): BillingPlan | null {
  if (data.access.kind !== "plan") return null;
  return planById(data.access.planId);
}

/** A subscription that renews: plan changes go through it instead of a new subscription. */
export function hasLiveSubscription(data: BillingData): boolean {
  const { subscription } = data;
  if (subscription === null || !subscription.hasSubscription) return false;
  if (subscription.cancelAtPeriodEnd) return false;
  return subscription.status === "active" || subscription.status === "past_due";
}

export function paymentToFix(data: BillingData): boolean {
  return data.notice?.kind === "past_due" || data.notice?.kind === "payment_failed";
}

export function priceOf(data: BillingData, planId: BillingPlanId): number | undefined {
  return data.prices.find((candidate) => candidate.id === planId)?.priceCents;
}

/**
 * Runs a subscription action: an Asaas page opens in the same tab; an action done here
 * refreshes the page and says what changed.
 */
export function useBillingAction<Input>(
  action: (input: Input) => Promise<{ url: string | null }>,
  doneMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (result) => {
      if (result.url !== null) {
        window.location.assign(result.url);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: billingQueryOptions().queryKey });
      toast.success(doneMessage);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
