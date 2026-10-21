import { isAppError, validationError } from "@sellbridge/shared/errors";
import { isNotFound, isRedirect } from "@tanstack/react-router";
import { z } from "zod";
import { UNEXPECTED_ERROR_MESSAGE } from "@/lib/errors";

const inputIssuesSchema = z.array(z.object({ message: z.string().min(1) })).min(1);

/**
 * TanStack Start rejects invalid input with a plain Error whose message is the Standard Schema
 * issue list as JSON. The first issue carries the message written in our schemas.
 */
function inputIssueMessage(error: Error): string | null {
  if (!error.message.startsWith("[")) {
    return null;
  }
  try {
    const issues = inputIssuesSchema.safeParse(JSON.parse(error.message));
    return issues.success ? (issues.data[0]?.message ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Decides what a server function may tell the browser, since only the message crosses the
 * wire. Errors the app raised on purpose and input validation keep their message; anything else
 * (a bug, a driver error) becomes a generic one, so no stack detail ever reaches the user.
 * Redirects and not-found are router signals, not errors, and pass through untouched.
 */
export function toUserFacingError(error: unknown): { error: unknown; isUnexpected: boolean } {
  if (isAppError(error) || isRedirect(error) || isNotFound(error)) {
    return { error, isUnexpected: false };
  }
  if (error instanceof Error) {
    const issue = inputIssueMessage(error);
    if (issue) {
      return { error: validationError(issue), isUnexpected: false };
    }
  }
  return { error: new Error(UNEXPECTED_ERROR_MESSAGE), isUnexpected: true };
}
