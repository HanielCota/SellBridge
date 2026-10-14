import { CUSTOMER_ISSUE_KINDS, type CustomerIssueKind } from "../schemas/admin.ts";
import { DAY_MILLISECONDS } from "./time.ts";

/**
 * How healthy a reseller's account is, as the admin sees it: what is broken right now, how far
 * the reseller got in the first steps, and a 0–100 score that ranks who needs help first.
 * Everything here is derived from counters the database already keeps, so it needs no storage.
 */

/** A fresh account gets a few days to finish the first steps before it counts as stalled. */
const ONBOARDING_GRACE_DAYS = 3;
/** No sign-in for this long and the reseller counts as gone quiet. */
const INACTIVE_AFTER_DAYS = 30;
/** A drop only counts when the earlier period had at least this many orders. */
const DECLINE_MIN_PREVIOUS_ORDERS = 5;
/** Orders falling by at least this share against the previous period count as a decline. */
const DECLINE_THRESHOLD = 0.5;

/** Points each open issue costs; onboarding costs per missing step instead. */
const ISSUE_PENALTIES: Record<Exclude<CustomerIssueKind, "onboarding">, number> = {
  store: 25,
  listings: 15,
  ticket: 10,
  cooling: 20,
};
const MISSING_STEP_PENALTY = 12;

export const ONBOARDING_STEPS = ["region", "store", "listing"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  region: "Região",
  store: "Loja",
  listing: "Publicação",
};

const ISSUE_SEVERITIES = ["danger", "warning", "info", "muted"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_SEVERITY: Record<CustomerIssueKind, IssueSeverity> = {
  store: "danger",
  listings: "danger",
  ticket: "info",
  onboarding: "warning",
  cooling: "muted",
};

const HEALTH_LEVELS = ["critical", "attention", "healthy"] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

export const CUSTOMER_STAGES = ["setup", "selling", "at_risk", "cooling"] as const;
export type CustomerStage = (typeof CUSTOMER_STAGES)[number];

export interface CustomerStoreSignal {
  marketplace: string;
  shopName: string;
  /** Any status but `disconnected`, which the reseller chose and is not a problem. */
  status: string;
}

/** The raw counters behind one customer's health. */
export interface CustomerSignals {
  banned: boolean;
  createdAt: Date;
  hasRegion: boolean;
  stores: readonly CustomerStoreSignal[];
  publishedListings: number;
  failedListings: number;
  /** Tickets waiting for the support team. */
  waitingTickets: number;
  recentOrders: number;
  /** Orders in the period right before the recent one, to spot a drop. */
  previousOrders: number;
  /** Last sign-in of the customer themself, never an admin acting as them. */
  lastSeenAt: Date | null;
}

export type CustomerIssue =
  | { kind: "store"; stores: readonly CustomerStoreSignal[] }
  | { kind: "listings"; count: number }
  | { kind: "ticket"; count: number }
  | { kind: "onboarding"; nextStep: OnboardingStep; completedSteps: number; idleDays: number }
  | { kind: "cooling"; reason: "decline"; dropPercent: number }
  | { kind: "cooling"; reason: "inactive"; idleDays: number };

export interface CustomerHealth {
  /** 0–100, or null for a blocked account, which is out of the running. */
  score: number | null;
  level: HealthLevel | null;
  /** Most urgent first. */
  issues: CustomerIssue[];
  completedSteps: number;
  nextStep: OnboardingStep | null;
  /** Where the customer is in their life on the platform, or null when blocked. */
  stage: CustomerStage | null;
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MILLISECONDS);
}

function brokenStores(signals: CustomerSignals): CustomerStoreSignal[] {
  return signals.stores.filter((store) => store.status === "expired" || store.status === "error");
}

function stepsDone(signals: CustomerSignals): Record<OnboardingStep, boolean> {
  return {
    region: signals.hasRegion,
    store: signals.stores.length > 0,
    listing: signals.publishedListings > 0,
  };
}

function nextOnboardingStep(signals: CustomerSignals): OnboardingStep | null {
  const done = stepsDone(signals);
  return ONBOARDING_STEPS.find((step) => !done[step]) ?? null;
}

function completedOnboardingSteps(signals: CustomerSignals): number {
  const done = stepsDone(signals);
  return ONBOARDING_STEPS.filter((step) => done[step]).length;
}

function onboardingIssue(signals: CustomerSignals, now: Date): CustomerIssue | null {
  const nextStep = nextOnboardingStep(signals);
  if (!nextStep) {
    return null;
  }
  const idleDays = daysBetween(signals.createdAt, now);
  if (idleDays < ONBOARDING_GRACE_DAYS) {
    return null;
  }
  return {
    kind: "onboarding",
    nextStep,
    completedSteps: completedOnboardingSteps(signals),
    idleDays,
  };
}

/** Orders fell by at least the threshold against a period busy enough to compare with. */
function declinePercent(signals: CustomerSignals): number | null {
  if (signals.previousOrders < DECLINE_MIN_PREVIOUS_ORDERS) {
    return null;
  }
  const drop = (signals.previousOrders - signals.recentOrders) / signals.previousOrders;
  if (drop < DECLINE_THRESHOLD) {
    return null;
  }
  return Math.round(drop * 100);
}

function coolingIssue(signals: CustomerSignals, now: Date): CustomerIssue | null {
  const dropPercent = declinePercent(signals);
  if (dropPercent !== null) {
    return { kind: "cooling", reason: "decline", dropPercent };
  }
  if (!signals.lastSeenAt) {
    return null;
  }
  const idleDays = daysBetween(signals.lastSeenAt, now);
  if (idleDays < INACTIVE_AFTER_DAYS) {
    return null;
  }
  return { kind: "cooling", reason: "inactive", idleDays };
}

function collectIssues(signals: CustomerSignals, now: Date): CustomerIssue[] {
  const stores = brokenStores(signals);
  const issues: (CustomerIssue | null)[] = [
    stores.length > 0 ? { kind: "store", stores } : null,
    signals.failedListings > 0 ? { kind: "listings", count: signals.failedListings } : null,
    signals.waitingTickets > 0 ? { kind: "ticket", count: signals.waitingTickets } : null,
    onboardingIssue(signals, now),
    coolingIssue(signals, now),
  ];
  return issues.filter((issue) => issue !== null);
}

function scoreFor(issues: readonly CustomerIssue[], completedSteps: number): number {
  const missingSteps = ONBOARDING_STEPS.length - completedSteps;
  const penalty = issues.reduce(
    (total, issue) => total + (issue.kind === "onboarding" ? 0 : ISSUE_PENALTIES[issue.kind]),
    missingSteps * MISSING_STEP_PENALTY,
  );
  return Math.max(0, 100 - penalty);
}

export function healthLevel(score: number): HealthLevel {
  if (score >= 70) {
    return "healthy";
  }
  if (score >= 40) {
    return "attention";
  }
  return "critical";
}

function stageFor(issues: readonly CustomerIssue[], completedSteps: number): CustomerStage {
  if (completedSteps < ONBOARDING_STEPS.length) {
    return "setup";
  }
  if (issues.some((issue) => ISSUE_SEVERITY[issue.kind] === "danger")) {
    return "at_risk";
  }
  if (issues.some((issue) => issue.kind === "cooling")) {
    return "cooling";
  }
  return "selling";
}

export function assessCustomerHealth(
  signals: CustomerSignals,
  now: Date = new Date(),
): CustomerHealth {
  const completedSteps = completedOnboardingSteps(signals);
  const nextStep = nextOnboardingStep(signals);
  if (signals.banned) {
    return { score: null, level: null, issues: [], completedSteps, nextStep, stage: null };
  }
  const issues = collectIssues(signals, now);
  const score = scoreFor(issues, completedSteps);
  return {
    score,
    level: healthLevel(score),
    issues,
    completedSteps,
    nextStep,
    stage: stageFor(issues, completedSteps),
  };
}

/** Position of an issue kind in the urgency order, for sorting across customers. */
export function issueRank(kind: CustomerIssueKind): number {
  return CUSTOMER_ISSUE_KINDS.indexOf(kind);
}
