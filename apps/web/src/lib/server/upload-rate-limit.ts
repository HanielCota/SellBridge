import { rateLimitedError } from "@sellbridge/shared/errors";

/** How many uploads one account may send in a window. */
export interface UploadBudget {
  maxRequests: number;
  windowMilliseconds: number;
}

const TEN_MINUTES = 10 * 60_000;

/** Ticket messages with files (open, reply, staff reply): a busy conversation, not a flood. */
export const SUPPORT_UPLOAD_BUDGET: UploadBudget = {
  maxRequests: 30,
  windowMilliseconds: TEN_MINUTES,
};
/** Profile photo: a few tries to get the picture right. */
export const AVATAR_UPLOAD_BUDGET: UploadBudget = {
  maxRequests: 10,
  windowMilliseconds: TEN_MINUTES,
};

export interface UploadLimiter {
  /** Counts one upload for `key`; false when the budget for the window is spent. */
  take(key: string, now?: Date): boolean;
}

/**
 * A sliding window per account, kept in memory: one web instance serves the app (the same
 * reason Better Auth's sign-in limits live in memory, see auth.ts). A restart forgets the
 * counts; several instances would need Redis or a table (item 32).
 */
export function createUploadLimiter(budget: UploadBudget): UploadLimiter {
  const recent = new Map<string, number[]>();
  return {
    take(key, now = new Date()) {
      const since = now.getTime() - budget.windowMilliseconds;
      const inWindow = (recent.get(key) ?? []).filter((at) => at > since);
      if (inWindow.length >= budget.maxRequests) {
        recent.set(key, inWindow);
        return false;
      }
      // Accounts whose uploads all left the window are forgotten, so the map stays small.
      for (const [other, times] of recent) {
        if (times.every((at) => at <= since)) {
          recent.delete(other);
        }
      }
      recent.set(key, [...inWindow, now.getTime()]);
      return true;
    },
  };
}

export const supportUploads = createUploadLimiter(SUPPORT_UPLOAD_BUDGET);
export const avatarUploads = createUploadLimiter(AVATAR_UPLOAD_BUDGET);

/**
 * Refuses with 429 when the account spent its budget: before the body is read for the photo,
 * right after the size-capped form is read for support (only forms that carry files).
 */
export function assertUploadAllowed(limiter: UploadLimiter, key: string): void {
  if (limiter.take(key)) {
    return;
  }
  throw rateLimitedError(
    "Você enviou muitos arquivos em pouco tempo. Tente de novo em alguns minutos.",
  );
}
