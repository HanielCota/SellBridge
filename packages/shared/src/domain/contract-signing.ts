import { z } from "zod";
import { CONTRACT_SIGNING_GRACE_DAYS, type ContractDocument } from "./contract-documents.ts";
import type { ProfileKind } from "./profile-kind.ts";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/** Digits of the code sent by e-mail. */
export const SIGNING_CODE_LENGTH = 6;
export const SIGNING_CODE_TTL_IN_MINUTES = 10;
/** Wrong tries before the code stops working and a new one is needed. */
export const SIGNING_CODE_MAX_ATTEMPTS = 5;
/** Wait before asking for another code, so a double click never sends two. */
export const SIGNING_CODE_RESEND_WAIT_IN_SECONDS = 60;
/**
 * Codes one person may ask for in 24 hours: caps the e-mails sent to one inbox, so no one can
 * spend the daily e-mail allowance.
 */
export const SIGNING_CODES_PER_DAY = 5;

/**
 * Where a profile stands with the contract of its kind:
 * - `not_required`: the switch is off (nothing changes for anyone);
 * - `signed`: the version in force is signed;
 * - `grace`: it used SellBridge before and still has until `deadline` to sign;
 * - `overdue`: the deadline passed;
 * - `must_sign`: a new profile, which signs before anything else.
 */
export type ContractStanding =
  | { kind: "not_required" }
  | { kind: "signed" }
  | { kind: "grace"; deadline: Date }
  | { kind: "overdue"; deadline: Date }
  | { kind: "must_sign" };

export interface ContractStandingInput {
  /** When the admin turned the switch on; null while off. */
  requiredSince: Date | null;
  signedVersionInForce: boolean;
  profileCreatedAt: Date;
  contract: Pick<ContractDocument, "effectiveAt">;
  now: Date;
}

function laterOf(first: Date, second: Date): Date {
  return first.getTime() >= second.getTime() ? first : second;
}

/** The moment the contract in force started to be asked: the switch, or a later version. */
function askedSince(requiredSince: Date, contract: Pick<ContractDocument, "effectiveAt">): Date {
  const effectiveAt = new Date(contract.effectiveAt);
  if (Number.isNaN(effectiveAt.getTime())) {
    throw new Error(`Invalid contract effectiveAt: ${contract.effectiveAt}`);
  }
  return laterOf(requiredSince, effectiveAt);
}

export function contractStanding(input: ContractStandingInput): ContractStanding {
  if (input.requiredSince === null) {
    return { kind: "not_required" };
  }
  if (input.signedVersionInForce) {
    return { kind: "signed" };
  }
  const since = askedSince(input.requiredSince, input.contract);
  if (input.profileCreatedAt.getTime() >= since.getTime()) {
    return { kind: "must_sign" };
  }
  const deadline = new Date(since.getTime() + CONTRACT_SIGNING_GRACE_DAYS * DAY_IN_MS);
  if (input.now.getTime() < deadline.getTime()) {
    return { kind: "grace", deadline };
  }
  return { kind: "overdue", deadline };
}

/**
 * Whether the profile only sees the signing screen. A seller past the deadline is held there
 * (Guilherme, 21/11/2026, "Aprovo os quatro"); a supplier past it keeps the panel to ship the
 * sales already made, and only its listings pause.
 */
export function signingBlocksPanel(standing: ContractStanding, kind: ProfileKind): boolean {
  if (standing.kind === "must_sign") {
    return true;
  }
  return standing.kind === "overdue" && kind === "seller";
}

/** Whether the profile may sign now: the switch is on and the version in force is not signed. */
export function canSignContract(standing: ContractStanding): boolean {
  return standing.kind === "grace" || standing.kind === "overdue" || standing.kind === "must_sign";
}

/** The summary lines left unticked, in the contract's order. */
export function uncheckedSummaryItems(
  contract: Pick<ContractDocument, "summary">,
  confirmedItemIds: readonly string[],
): string[] {
  const confirmed = new Set(confirmedItemIds);
  return contract.summary.filter((item) => !confirmed.has(item.id)).map((item) => item.id);
}

/** Whether a stored code may still be tried. */
export function signingCodeUsable(
  code: { expiresAt: Date; attempts: number; consumedAt: Date | null },
  now: Date,
): boolean {
  if (code.consumedAt !== null) {
    return false;
  }
  if (code.attempts >= SIGNING_CODE_MAX_ATTEMPTS) {
    return false;
  }
  return now.getTime() < code.expiresAt.getTime();
}

/** Seconds left before another code may be asked; 0 when it may be asked now. */
export function signingCodeResendWaitInSeconds(lastSentAt: Date | null, now: Date): number {
  if (lastSentAt === null) {
    return 0;
  }
  const elapsedInSeconds = Math.floor((now.getTime() - lastSentAt.getTime()) / 1000);
  return Math.max(0, SIGNING_CODE_RESEND_WAIT_IN_SECONDS - elapsedInSeconds);
}

/**
 * What the code field keeps from what was typed or pasted: digits only, at most the length of a
 * code. Pasting " 123 456" from the e-mail gives "123456".
 */
export function typedSigningCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, SIGNING_CODE_LENGTH);
}

export const signingCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${SIGNING_CODE_LENGTH}}$`), {
    error: `Digite os ${SIGNING_CODE_LENGTH} números do código enviado ao seu e-mail.`,
  });

const MAX_TIME_ZONE_LENGTH = 64;

function isKnownTimeZone(value: string): boolean {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone !== "";
  } catch {
    return false;
  }
}

/** The browser's IANA time zone (e.g. "America/Sao_Paulo"), stored with the signature. */
export const signerTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TIME_ZONE_LENGTH)
  .refine(isKnownTimeZone, { error: "Fuso horário inválido" });

const MAX_CONFIRMED_ITEMS = 50;
const MAX_ITEM_ID_LENGTH = 64;

const confirmedItemIdsSchema = z
  .array(z.string().trim().min(1).max(MAX_ITEM_ID_LENGTH))
  .max(MAX_CONFIRMED_ITEMS);

export const requestSigningCodeSchema = z.object({
  version: z.string().trim().min(1).max(MAX_ITEM_ID_LENGTH),
  confirmedItemIds: confirmedItemIdsSchema,
});

export const signContractSchema = requestSigningCodeSchema.extend({
  code: signingCodeSchema,
  timeZone: signerTimeZoneSchema,
});

export type SignerDeviceType = "mobile" | "tablet" | "desktop" | "unknown";

/**
 * A plain reading of the user agent, kept beside the raw text in the signature record: enough
 * to say "celular, Chrome" in a dispute without a parsing library.
 */
export function describeUserAgent(userAgent: string | null): {
  deviceType: SignerDeviceType;
  browser: string;
} {
  if (userAgent === null || userAgent.trim() === "") {
    return { deviceType: "unknown", browser: "unknown" };
  }
  return { deviceType: deviceTypeOf(userAgent), browser: browserOf(userAgent) };
}

function deviceTypeOf(userAgent: string): SignerDeviceType {
  if (
    /iPad|Tablet/i.test(userAgent) ||
    (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))
  ) {
    return "tablet";
  }
  if (/Mobi|iPhone|Android/i.test(userAgent)) {
    return "mobile";
  }
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) {
    return "desktop";
  }
  return "unknown";
}

// Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
const BROWSER_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["Edge", /Edg\//],
  ["Opera", /OPR\//],
  ["Samsung Internet", /SamsungBrowser\//],
  ["Firefox", /Firefox\/|FxiOS\//],
  ["Chrome", /Chrome\/|CriOS\//],
  ["Safari", /Safari\//],
];

function browserOf(userAgent: string): string {
  const match = BROWSER_PATTERNS.find(([, pattern]) => pattern.test(userAgent));
  if (match === undefined) {
    return "unknown";
  }
  return match[0];
}
