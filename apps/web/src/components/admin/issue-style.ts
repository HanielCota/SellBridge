import type { IssueSeverity } from "@sellbridge/shared/customer-health";
import type { CustomerIssueKind } from "@sellbridge/shared/schemas";
import type { ComponentType } from "react";
import {
  ListingAlertIcon,
  OnboardingRocketIcon,
  SalesDropIcon,
  StorePausedIcon,
  SupportHeadsetIcon,
} from "@/components/reports/attention-icons";

/** Each issue keeps the animated mark the reseller already sees on their own dashboard. */
export const ISSUE_ICONS: Record<CustomerIssueKind, ComponentType<{ className?: string }>> = {
  store: StorePausedIcon,
  listings: ListingAlertIcon,
  ticket: SupportHeadsetIcon,
  onboarding: OnboardingRocketIcon,
  cooling: SalesDropIcon,
};

/** Tinted tile behind an issue's icon, matching the "Precisa de você" panel. */
export const SEVERITY_TINT: Record<IssueSeverity, string> = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground",
};

/** The same tint on a chip, which needs a touch more color to read at its size. */
export const SEVERITY_BADGE: Record<IssueSeverity, string> = {
  danger: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground",
};
