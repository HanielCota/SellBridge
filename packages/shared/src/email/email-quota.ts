import { createHash } from "node:crypto";

/**
 * `account`: what a person needs to get into the account (confirming the address, a new
 * password). `general`: everything else. Each kind has its own daily allowance, so a burst of
 * notices can never hold back a password reset.
 */
export type EmailCategory = "account" | "general";

/** E-mails per day (America/Sao_Paulo); 0 sends none of that kind. */
export interface EmailQuotaLimits {
  accountDaily: number;
  accountPerRecipientDaily: number;
  generalDaily: number;
  generalPerRecipientDaily: number;
}

/** `system`: the whole product reached its allowance; `recipient`: one address did. */
export type EmailQuotaScope = "system" | "recipient";

export type EmailQuotaVerdict =
  | { allowed: true }
  | {
      allowed: false;
      scope: EmailQuotaScope;
      /** True for one caller per day, kind and scope: the one that tells the team. */
      firstToday: boolean;
      /** When the allowance is whole again. */
      resetsAt: Date;
    };

export interface EmailQuota {
  /** Counts one e-mail against today's allowance, or says which allowance is used up. */
  reserve(email: { to: string; category: EmailCategory }): Promise<EmailQuotaVerdict>;
}

export interface EmailQuotaReservation {
  systemKey: string;
  recipientKey: string;
  systemLimit: number;
  recipientLimit: number;
  ttlInSeconds: number;
}

export type EmailQuotaReservationResult = "reserved" | "system_full" | "recipient_full";

/** Where the counters live; shared by every process, so the web app and the worker add up. */
export interface EmailQuotaStore {
  /** Counts one e-mail on both counters unless either is full, as one atomic step. */
  reserve(reservation: EmailQuotaReservation): Promise<EmailQuotaReservationResult>;
  /** True for the first caller of `key` only, until it expires. */
  claimOnce(key: string, ttlInSeconds: number): Promise<boolean>;
}

export interface EmailQuotaOptions {
  store: EmailQuotaStore;
  limits: EmailQuotaLimits;
  now?: () => Date;
}

const KEY_PREFIX = "sellbridge:email-quota:";
/** Brazil has had no daylight saving time since 2019: the day turns at 03:00 UTC. */
const SAO_PAULO_OFFSET_IN_MS = -3 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
/** Counters outlive their day by a day, then Redis drops them. */
const COUNTER_TTL_IN_SECONDS = 2 * 24 * 60 * 60;
const RECIPIENT_HASH_LENGTH = 32;

/** The calendar day in America/Sao_Paulo, as YYYY-MM-DD. */
function saoPauloDay(now: Date): string {
  return new Date(now.getTime() + SAO_PAULO_OFFSET_IN_MS).toISOString().slice(0, 10);
}

function nextSaoPauloMidnight(now: Date): Date {
  const localTime = now.getTime() + SAO_PAULO_OFFSET_IN_MS;
  const nextLocalMidnight = (Math.floor(localTime / DAY_IN_MS) + 1) * DAY_IN_MS;
  return new Date(nextLocalMidnight - SAO_PAULO_OFFSET_IN_MS);
}

/** The address never reaches Redis: counters are keyed by a hash of it. */
function recipientHash(address: string): string {
  return createHash("sha256")
    .update(address.trim().toLowerCase())
    .digest("hex")
    .slice(0, RECIPIENT_HASH_LENGTH);
}

function limitsOf(limits: EmailQuotaLimits, category: EmailCategory) {
  if (category === "account") {
    return { system: limits.accountDaily, recipient: limits.accountPerRecipientDaily };
  }
  return { system: limits.generalDaily, recipient: limits.generalPerRecipientDaily };
}

/**
 * The daily e-mail allowance of the whole product and of each address. The day is the calendar
 * day in America/Sao_Paulo; an attempt counts even when the provider then fails, so a retry
 * storm is held back too.
 */
export function createEmailQuota(options: EmailQuotaOptions): EmailQuota {
  const currentTime = options.now ?? (() => new Date());

  return {
    async reserve(email) {
      const now = currentTime();
      const dayPrefix = `${KEY_PREFIX}${saoPauloDay(now)}:${email.category}`;
      const limits = limitsOf(options.limits, email.category);
      const result = await options.store.reserve({
        systemKey: `${dayPrefix}:system`,
        recipientKey: `${dayPrefix}:to:${recipientHash(email.to)}`,
        systemLimit: limits.system,
        recipientLimit: limits.recipient,
        ttlInSeconds: COUNTER_TTL_IN_SECONDS,
      });
      if (result === "reserved") {
        return { allowed: true };
      }
      const scope: EmailQuotaScope = result === "system_full" ? "system" : "recipient";
      const firstToday = await options.store.claimOnce(
        `${dayPrefix}:alerted:${scope}`,
        COUNTER_TTL_IN_SECONDS,
      );
      return { allowed: false, scope, firstToday, resetsAt: nextSaoPauloMidnight(now) };
    },
  };
}
