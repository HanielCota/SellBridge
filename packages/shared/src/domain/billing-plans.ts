import { forbiddenError } from "../runtime/errors.ts";

/** What a plan can release beyond its limits (M1). */
export const PLAN_FEATURES = [
  "advanced_reports",
  "fiscal",
  "ai_assistant",
  "priority_support",
] as const;

export type PlanFeature = (typeof PLAN_FEATURES)[number];

export type BillingPlanId = "free" | "pro" | "business" | "start" | "black" | "elite";

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  stores: number;
  listings: number;
  /** People on the account; null when the plan does not limit it. */
  users: number | null;
  features: readonly PlanFeature[];
  /** Support first response target, in hours. */
  supportResponseHours: number;
  /** The monthly price the PDF lists; what is charged always comes from Stripe. */
  referencePriceCents: number | null;
}

/** Today's three plans: limits on stores and listings, every feature released. */
const CLASSIC_PLANS: readonly BillingPlan[] = [
  {
    id: "free",
    name: "Gratuito",
    stores: 2,
    listings: 25,
    users: null,
    features: PLAN_FEATURES,
    supportResponseHours: 24,
    referencePriceCents: 0,
  },
  {
    id: "pro",
    name: "Pro",
    stores: 10,
    listings: 500,
    users: null,
    features: PLAN_FEATURES,
    supportResponseHours: 24,
    referencePriceCents: null,
  },
  {
    id: "business",
    name: "Business",
    stores: 50,
    listings: 5000,
    users: null,
    features: PLAN_FEATURES,
    supportResponseHours: 24,
    referencePriceCents: null,
  },
];

/**
 * The PDF's plans (R$ 97 to R$ 997). Gratuito stays as the fallback of an account without a
 * subscription; it is not sold.
 * TODO(client:D10): which feature and limit goes in which plan; these numbers only keep the
 * order of the PDF (each plan gives more than the one before).
 */
const PDF_PLANS: readonly BillingPlan[] = [
  {
    id: "free",
    name: "Gratuito",
    stores: 1,
    listings: 25,
    users: 1,
    features: [],
    supportResponseHours: 48,
    referencePriceCents: 0,
  },
  {
    id: "start",
    name: "Start",
    stores: 2,
    listings: 100,
    users: 1,
    features: [],
    supportResponseHours: 48,
    referencePriceCents: 9_700,
  },
  {
    id: "pro",
    name: "Pro",
    stores: 5,
    listings: 500,
    users: 2,
    features: ["advanced_reports"],
    supportResponseHours: 24,
    referencePriceCents: 19_700,
  },
  {
    id: "business",
    name: "Business",
    stores: 10,
    listings: 2_000,
    users: 5,
    features: ["advanced_reports", "fiscal"],
    supportResponseHours: 24,
    referencePriceCents: 39_700,
  },
  {
    id: "black",
    name: "Black",
    stores: 25,
    listings: 5_000,
    users: 10,
    features: ["advanced_reports", "fiscal", "ai_assistant"],
    supportResponseHours: 8,
    referencePriceCents: 69_700,
  },
  {
    id: "elite",
    name: "Elite",
    stores: 50,
    listings: 10_000,
    users: 20,
    features: PLAN_FEATURES,
    supportResponseHours: 2,
    referencePriceCents: 99_700,
  },
];

/** The plans in force: the PDF's matrix when `matrixEnabled` (PLAN_MATRIX_ENABLED), else today's. */
export function planCatalog(matrixEnabled: boolean): readonly BillingPlan[] {
  return matrixEnabled ? PDF_PLANS : CLASSIC_PLANS;
}

export type PaidPlanId = Exclude<BillingPlanId, "free">;

/** The plans a reseller can subscribe to, cheapest first. */
export function paidPlanIds(matrixEnabled: boolean): PaidPlanId[] {
  return planCatalog(matrixEnabled).flatMap((plan) => (plan.id === "free" ? [] : [plan.id]));
}

export function planAllows(plan: BillingPlan, feature: PlanFeature): boolean {
  return plan.features.includes(feature);
}

/** Refuses on the server, not only in the interface, a feature the plan does not include (M6). */
export function requirePlanFeature(plan: BillingPlan, feature: PlanFeature): void {
  if (planAllows(plan, feature)) {
    return;
  }
  throw forbiddenError(
    `O plano ${plan.name} não inclui este recurso. Veja os planos em Assinatura.`,
  );
}
