import { createHash } from "node:crypto";
import type { ProblemArea, ProblemService } from "../domain/problem-areas.ts";
import { isSensitiveLogKey, type ProblemLogEntry } from "./logger.ts";

/** One occurrence of a problem, ready to be stored: nothing secret or personal is left in it. */
export interface CapturedProblem {
  service: ProblemService;
  event: string;
  area: ProblemArea;
  /** Short and readable: the reason shown to the customer, or the error's own message. */
  message: string;
  /** Same service, event and message (ids and numbers aside) give the same fingerprint. */
  fingerprint: string;
  tenantId: string | null;
  storeConnectionId: string | null;
  listingTargetId: string | null;
  /** The log fields, redacted and size-bounded, for the detail screen. */
  context: Record<string, unknown>;
  occurredAt: Date;
}

const MAXIMUM_MESSAGE_LENGTH = 300;
const MAXIMUM_STRING_LENGTH = 2000;
const MAXIMUM_DEPTH = 4;
const MAXIMUM_ARRAY_ITEMS = 20;
const MAXIMUM_OBJECT_KEYS = 40;
const FINGERPRINT_TEXT_LENGTH = 200;
const REDACTED = "[redacted]";
const LOG_ENVELOPE_KEYS: ReadonlySet<string> = new Set(["level", "event", "time"]);

/**
 * Warnings that are problems the team must see. A publication that failed for good is the case
 * the reseller found before the team on 12/11/2026; retries and refused requests stay out.
 */
const RECORDED_WARNINGS: Readonly<Record<string, (fields: Record<string, unknown>) => boolean>> = {
  "listing.publish_failed": (fields) => fields.isFinal === true,
  "listing.sync_failed": () => true,
  "listing.description_resend_failed": () => true,
};

interface AreaRule {
  area: ProblemArea;
  events: RegExp;
  queues: RegExp;
}

/** First match wins: "listing.sync_failed" is a sync problem before it is a listing one. */
const AREA_RULES: readonly AreaRule[] = [
  { area: "sync", events: /^listing\.sync|stock|price_sync/, queues: /stock-price-sync/ },
  { area: "publishing", events: /^listing\.|publish|description/, queues: /^publish-/ },
  { area: "invoices", events: /^erp\.|^bling\.|invoice|nfe|fiscal/, queues: /^erp-/ },
  {
    area: "payments",
    events: /^billing\.|^mercado_pago\.|^stripe\.|payment|payout|subscription/,
    queues: /payment/,
  },
  {
    area: "email",
    events: /^email\.|email|confirmation_link|verification/,
    queues: /notification-delivery/,
  },
  {
    area: "orders",
    events:
      /^order|^fulfillment\.|^shipment\.|^supplier_panel\.|^store\.order|^webhook\.(enqueue|rejected)|reservation|reserve|label/,
    queues: /^webhook-event|^order-|shipment-tracking/,
  },
];

/** Values that look like secrets or personal data, wherever they sit in a message or a field. */
const SCRUBBERS: readonly { pattern: RegExp; replace: (match: string) => string }[] = [
  { pattern: /Bearer\s+[^\s"',]+/gi, replace: () => `Bearer ${REDACTED}` },
  { pattern: /eyJ[\w-]+\.[\w-]+\.[\w-]+/g, replace: () => REDACTED },
  {
    pattern: /(https?:\/\/[^\s?"']+)\?[^\s"']*/g,
    replace: (match) => `${match.split("?")[0]}?${REDACTED}`,
  },
  { pattern: /[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g, replace: () => REDACTED },
  { pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, replace: () => REDACTED },
  { pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, replace: () => REDACTED },
  { pattern: /\b[\w-]{32,}\b/g, replace: (match) => (isUuid(match) ? match : REDACTED) },
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Removes e-mails, CPF/CNPJ, tokens and URL query strings from free text. */
export function scrubText(text: string): string {
  let scrubbed = text;
  for (const scrubber of SCRUBBERS) {
    scrubbed = scrubbed.replace(scrubber.pattern, scrubber.replace);
  }
  return scrubbed;
}

function truncate(text: string, length: number): string {
  if (text.length <= length) {
    return text;
  }
  return `${text.slice(0, length - 1)}…`;
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (isSensitiveLogKey(key)) {
    return REDACTED;
  }
  if (typeof value === "string") {
    return truncate(scrubText(value), MAXIMUM_STRING_LENGTH);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (depth >= MAXIMUM_DEPTH) {
    return "[…]";
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAXIMUM_ARRAY_ITEMS)
      .map((item: unknown) => sanitizeValue("", item, depth + 1));
  }
  return sanitizeObject(value, depth + 1);
}

function sanitizeObject(value: object, depth: number): Record<string, unknown> {
  const entries = Object.entries(value)
    .slice(0, MAXIMUM_OBJECT_KEYS)
    .map(([key, item]): [string, unknown] => [key, sanitizeValue(key, item, depth)]);
  return Object.fromEntries(entries);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(fields: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return null;
}

/** The error's own message, from `error`, `diagnostic` or `cause` as the logger wrote them. */
function errorMessage(fields: Record<string, unknown>): string | null {
  for (const key of ["error", "diagnostic", "cause"]) {
    const value = fields[key];
    if (isRecord(value)) {
      const message = stringField(value, "message");
      if (message !== null) {
        return message;
      }
    }
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return null;
}

/** Classifies by the log event first, then by the worker queue the job ran in. */
export function problemAreaOf(event: string, queue: string | null): ProblemArea {
  const byEvent = AREA_RULES.find((rule) => rule.events.test(event));
  if (byEvent !== undefined) {
    return byEvent.area;
  }
  if (queue === null) {
    return "other";
  }
  return AREA_RULES.find((rule) => rule.queues.test(queue))?.area ?? "other";
}

function normalizedForFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FINGERPRINT_TEXT_LENGTH);
}

/** Groups repeats of the same problem: ids, counts and amounts in the message do not split it. */
export function problemFingerprint(service: ProblemService, event: string, text: string): string {
  const key = `${service}|${event}|${normalizedForFingerprint(text)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function shouldRecord(entry: ProblemLogEntry, fields: Record<string, unknown>): boolean {
  if (entry.level === "error") {
    return true;
  }
  const accepts = RECORDED_WARNINGS[entry.event];
  return accepts !== undefined && accepts(fields);
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function contextOf(fields: Record<string, unknown>): Record<string, unknown> {
  const withoutEnvelope = Object.fromEntries(
    Object.entries(fields).filter(([key]) => !LOG_ENVELOPE_KEYS.has(key)),
  );
  return sanitizeObject(withoutEnvelope, 0);
}

/**
 * Turns a warning or error log entry into a problem to store, or null when it is not one the
 * team must see (or the line cannot be read). The entry was already redacted by the logger;
 * values that still look personal or secret are removed here too.
 */
export function captureProblem(
  entry: ProblemLogEntry,
  service: ProblemService,
  occurredAt: Date,
): CapturedProblem | null {
  const fields = parseLine(entry.line);
  if (fields === null || !shouldRecord(entry, fields)) {
    return null;
  }
  const context = contextOf(fields);
  const rawError = errorMessage(context);
  const reason = stringField(context, "reason");
  const message = truncate(reason ?? rawError ?? entry.event, MAXIMUM_MESSAGE_LENGTH);
  return {
    service,
    event: entry.event,
    area: problemAreaOf(entry.event, stringField(context, "queue")),
    message,
    fingerprint: problemFingerprint(service, entry.event, rawError ?? message),
    tenantId: stringField(context, "tenantId"),
    storeConnectionId: stringField(context, "storeConnectionId", "storeId"),
    listingTargetId: stringField(context, "listingTargetId", "targetId"),
    context,
    occurredAt,
  };
}
