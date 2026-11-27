import { ENTRY_BILLING_PLAN, type BillingAccess } from "@sellbridge/shared/billing";

export interface PlanCounts {
  stores: number;
  listings: number;
}

/**
 * What the account's plan allows, what it already uses and what is left. "unlimited" covers
 * billing switched off and the launch transition: nothing is counted against a limit then.
 */
export type PlanRoom =
  | { kind: "unlimited"; used: PlanCounts }
  | {
      kind: "plan";
      planId: string;
      planName: string;
      allowed: PlanCounts;
      used: PlanCounts;
      left: PlanCounts;
    }
  | { kind: "no_plan"; allowed: PlanCounts; used: PlanCounts; left: PlanCounts };

function leftOf(allowed: PlanCounts, used: PlanCounts): PlanCounts {
  // An account over its plan after a downgrade has nothing left, never a negative room.
  return {
    stores: Math.max(0, allowed.stores - used.stores),
    listings: Math.max(0, allowed.listings - used.listings),
  };
}

/** The room of an account, from its access (null while billing is off) and its usage. */
export function planRoomOf(access: BillingAccess | null, used: PlanCounts): PlanRoom {
  if (access === null || access.kind === "transition") {
    return { kind: "unlimited", used };
  }

  if (access.kind === "none") {
    const allowed = { stores: 0, listings: 0 };
    return { kind: "no_plan", allowed, used, left: leftOf(allowed, used) };
  }

  const plan = access.kind === "free" ? ENTRY_BILLING_PLAN : access.plan;
  const allowed = { stores: plan.stores, listings: plan.listings };
  return {
    kind: "plan",
    planId: access.kind === "free" ? "free" : plan.id,
    planName: access.kind === "free" ? "Gratuito" : plan.name,
    allowed,
    used,
    left: leftOf(allowed, used),
  };
}

/** How many more listings a batch would need beyond the plan; 0 when it fits. */
export function listingsShortBy(room: PlanRoom, requested: number): number {
  if (room.kind === "unlimited") {
    return 0;
  }
  return Math.max(0, requested - room.left.listings);
}
