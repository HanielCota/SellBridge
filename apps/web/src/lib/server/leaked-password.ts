import { createHash } from "node:crypto";
import { logger } from "@sellbridge/shared/logger";
import {
  PASSWORD_COMPROMISED_CODE,
  PASSWORD_COMPROMISED_MESSAGE,
} from "@sellbridge/shared/schemas";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { z } from "zod";

export type FetchRange = (url: string, init: RequestInit) => Promise<Response>;

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
/** A slow lookup must not hold the sign-up: past this, the password goes through (logged). */
const LOOKUP_TIMEOUT_MILLISECONDS = 3000;

/** Where a route carries the password it is about to save. */
const NEW_PASSWORD_FIELD: Readonly<Record<string, "password" | "newPassword">> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
  "/set-password": "newPassword",
};

/** The password a route is about to save, or null for routes that only check one. */
export function newPasswordOf(path: string, body: unknown): string | null {
  const field = NEW_PASSWORD_FIELD[path];
  if (field === undefined) {
    return null;
  }
  const parsed = z.object({ [field]: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    return null;
  }
  return parsed.data[field] ?? null;
}

function countFor(rangeBody: string, suffix: string): number {
  for (const line of rangeBody.split(/\r?\n/)) {
    const [lineSuffix, count] = line.split(":");
    if (lineSuffix?.toUpperCase() === suffix) {
      return Number(count ?? "0");
    }
  }
  return 0;
}

/**
 * Whether the password appears in known breaches (Have I Been Pwned). Only the first five
 * characters of its SHA-1 leave the server (k-anonymity); padding lines carry count 0. When the
 * service fails or is slow the answer is "no" and the failure is logged: item 30 decided that an
 * outage there must never block a sign-up.
 */
export async function isPasswordLeaked(password: string, fetchRange: FetchRange): Promise<boolean> {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const response = await fetchRange(`${RANGE_URL}${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true", "User-Agent": "SellBridge" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) {
      logger.warn("auth.leaked_password_check_failed", { status: response.status });
      return false;
    }
    return countFor(await response.text(), hash.slice(5)) > 0;
  } catch (error) {
    logger.warn("auth.leaked_password_check_failed", { error });
    return false;
  }
}

/** Whether the check runs: LEAKED_PASSWORD_CHECK, where "auto" means production only. */
export function isLeakedPasswordCheckOn(setting: "auto" | "on" | "off", nodeEnv: string): boolean {
  if (setting === "auto") {
    return nodeEnv === "production";
  }
  return setting === "on";
}

/**
 * Refuses a new password found in breaches on sign-up, change, reset and set. Always installed
 * (a plugin list that changes shape would loosen Better Auth's types); `enabled` turns it off.
 */
export function leakedPasswordCheck(options: {
  enabled: boolean;
  fetchRange?: FetchRange;
}): BetterAuthPlugin {
  const fetchRange = options.fetchRange ?? fetch;
  return {
    id: "leaked-password-check",
    hooks: {
      before: [
        {
          matcher: (context) =>
            options.enabled && context.path !== undefined && context.path in NEW_PASSWORD_FIELD,
          handler: createAuthMiddleware(async (context) => {
            const password = newPasswordOf(context.path, context.body);
            if (password === null || !(await isPasswordLeaked(password, fetchRange))) {
              return;
            }
            throw new APIError("BAD_REQUEST", {
              message: PASSWORD_COMPROMISED_MESSAGE,
              code: PASSWORD_COMPROMISED_CODE,
            });
          }),
        },
      ],
    },
  };
}
