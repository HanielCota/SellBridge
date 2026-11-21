import type { BillingPlan } from "@sellbridge/shared/billing";
import {
  dateLabel,
  hasLiveSubscription,
  OWNER_ONLY_REASON,
  paymentToFix,
  type BillingData,
} from "./billing-data";

const PAY_FIRST_REASON = "Pague a mensalidade em aberto antes de trocar de plano";

export type PlanCardState =
  | { kind: "off" }
  | { kind: "in_use" }
  | { kind: "starts"; on: string }
  | { kind: "courtesy" }
  | { kind: "button"; label: string; reason: string | null };

function blockedReason(data: BillingData, live: boolean): string | null {
  if (!data.canManage) return OWNER_ONLY_REASON;
  if (live && paymentToFix(data)) return PAY_FIRST_REASON;
  return null;
}

/**
 * What a plan card offers. With a courtesy plan in force there is nothing to subscribe to, even
 * while a larger month already paid still sets the limits: the server refuses it either way.
 */
export function planCardState(
  plan: BillingPlan,
  data: BillingData,
  isCurrent: boolean,
): PlanCardState {
  if (data.courtesy !== null) return isCurrent ? { kind: "in_use" } : { kind: "courtesy" };
  if (!data.enabled) return { kind: "off" };
  const live = hasLiveSubscription(data);
  const scheduled = data.subscription?.scheduledPlan ?? null;
  const scheduledAt = data.subscription?.scheduledPlanAt ?? null;
  if (scheduled === plan.id && scheduledAt !== null) {
    return { kind: "starts", on: dateLabel(scheduledAt) };
  }
  if (isCurrent && live && scheduled === null) return { kind: "in_use" };
  const reason = blockedReason(data, live);
  if (!live) return { kind: "button", label: `Assinar o ${plan.name}`, reason };
  const label = isCurrent ? `Continuar no ${plan.name}` : `Mudar para ${plan.name}`;
  return { kind: "button", label, reason };
}
