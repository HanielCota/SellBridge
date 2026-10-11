import { REVIEW_WINDOW_DAYS } from "@sellbridge/shared/supplier-score";

const DAY_MILLISECONDS = 86_400_000;

/** Delivered orders placed from this moment on can still be reviewed. */
export function reviewableSince(now: Date): Date {
  return new Date(now.getTime() - REVIEW_WINDOW_DAYS * DAY_MILLISECONDS);
}
