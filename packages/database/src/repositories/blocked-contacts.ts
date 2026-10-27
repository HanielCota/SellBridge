import { and, eq, gt, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client.ts";
import { adminAuditEvents, orderShipments } from "../schema/index.ts";
import { hashSupplierToken } from "./supplier-link.ts";

/** Where the refused text was typed. */
export type BlockedContactChannel = "seller_app" | "supplier_panel" | "supplier_link";

/** A refused attempt to send a contact, without the text: only who, where and what kind. */
export interface BlockedContactAttempt {
  channel: BlockedContactChannel;
  field: string;
  kinds: readonly string[];
  tenantId: string | null;
  /** The signed-in user; null on the supplier link, which has no login. */
  userId: string | null;
  /** The admin acting as the customer ("Entrar como cliente"), when it was them. */
  impersonatedBy?: string | null;
  /** The supplier link's raw token, only to find its supplier; it is never stored. */
  supplierToken: string | null;
}

/**
 * One entry per person and field in this window: a reseller retrying keeps the trail readable,
 * and the eight latest events of the customer's timeline stay the team's own actions.
 */
const REPEAT_WINDOW_MINUTES = 10;

const CONTACT_BLOCKED = "contact_blocked";

async function supplierOfLink(database: Database, token: string): Promise<string | null> {
  const [row] = await database
    .select({ supplierId: orderShipments.supplierId })
    .from(orderShipments)
    .where(eq(orderShipments.supplierTokenHash, hashSupplierToken(token)))
    .limit(1);
  return row?.supplierId ?? null;
}

/** Who the entry is about: the user's account, or the supplier behind the link. */
type AuditSubject = { userId: string } | { supplierId: string };

async function subjectOf(
  database: Database,
  attempt: BlockedContactAttempt,
): Promise<AuditSubject | null> {
  if (attempt.userId !== null) {
    return { userId: attempt.userId };
  }
  const supplierId =
    attempt.supplierToken === null ? null : await supplierOfLink(database, attempt.supplierToken);
  return supplierId === null ? null : { supplierId };
}

function subjectFilter(subject: AuditSubject): SQL | undefined {
  if ("userId" in subject) {
    return and(eq(adminAuditEvents.userId, subject.userId), isNull(adminAuditEvents.entityType));
  }
  return and(
    eq(adminAuditEvents.entityType, "supplier"),
    eq(adminAuditEvents.entityId, subject.supplierId),
  );
}

async function recentlyRecorded(
  database: Database,
  subject: AuditSubject,
  field: string,
): Promise<boolean> {
  const since = new Date(Date.now() - REPEAT_WINDOW_MINUTES * 60_000);
  const repeats = await database.$count(
    adminAuditEvents,
    and(
      subjectFilter(subject),
      eq(adminAuditEvents.action, CONTACT_BLOCKED),
      gt(adminAuditEvents.createdAt, since),
      sql`${adminAuditEvents.details}->>'field' = ${field}`,
    ),
  );
  return repeats > 0;
}

/**
 * The audit trail of a refused contact: on the user's account when signed in, on the supplier
 * when it came through the supplier link. A link that matches no shipment, or a repeat within
 * `REPEAT_WINDOW_MINUTES`, leaves no new entry (the server log still has every attempt).
 */
export async function recordBlockedContact(
  database: Database,
  attempt: BlockedContactAttempt,
): Promise<void> {
  const subject = await subjectOf(database, attempt);
  if (subject === null || (await recentlyRecorded(database, subject, attempt.field))) {
    return;
  }
  const details = {
    channel: attempt.channel,
    field: attempt.field,
    kinds: attempt.kinds.join(","),
    tenantId: attempt.tenantId,
    impersonatedBy: attempt.impersonatedBy ?? null,
  };
  const target =
    "userId" in subject
      ? { userId: subject.userId }
      : { entityType: "supplier", entityId: subject.supplierId };
  await database.insert(adminAuditEvents).values({ ...target, action: CONTACT_BLOCKED, details });
}
