import { ASAAS_MINIMUM_CHARGE_CENTS } from "@sellbridge/payments/asaas";
import { upgradeDifferenceCents, type BillingPlan } from "@sellbridge/shared/billing";
import { conflictError } from "@sellbridge/shared/errors";

/** What choosing another plan does to an active subscription. */
export type PlanChange =
  /** The plan already in force, with nothing scheduled. */
  | { kind: "keep" }
  /** The plan in force again: the smaller plan scheduled for the next charge is dropped. */
  | { kind: "cancel_schedule" }
  /** A smaller plan, from the next monthly charge on. */
  | { kind: "schedule"; startsAt: Date }
  /** A bigger plan now, with no charge: the rest of the month costs less than Asaas's minimum. */
  | { kind: "upgrade_now" }
  /** A bigger plan once the difference for the rest of the month is paid. */
  | { kind: "upgrade_pay"; differenceCents: number; until: Date };

/**
 * Decides a plan change. Moving down never refunds: the bigger plan stays until the month it
 * was paid for ends. Moving up charges the price difference for the days left.
 *
 * @throws {AppError} CONFLICT when the subscription has no paid month to change yet.
 */
export function planChangeOf(input: {
  current: BillingPlan;
  target: BillingPlan;
  scheduledPlan: string | null;
  paidPeriod: { start: Date; end: Date } | null;
  now: Date;
}): PlanChange {
  const { current, target, paidPeriod } = input;
  if (target.id === current.id) {
    return input.scheduledPlan === null ? { kind: "keep" } : { kind: "cancel_schedule" };
  }
  if (paidPeriod === null) {
    throw conflictError("Pague a primeira mensalidade antes de trocar de plano.");
  }
  if (target.priceCents < current.priceCents) {
    return { kind: "schedule", startsAt: paidPeriod.end };
  }
  const differenceCents = upgradeDifferenceCents({
    fromPriceCents: current.priceCents,
    toPriceCents: target.priceCents,
    periodStart: paidPeriod.start,
    periodEnd: paidPeriod.end,
    now: input.now,
  });
  if (differenceCents < ASAAS_MINIMUM_CHARGE_CENTS) return { kind: "upgrade_now" };
  return { kind: "upgrade_pay", differenceCents, until: paidPeriod.end };
}
