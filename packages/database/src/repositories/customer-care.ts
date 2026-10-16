import type { CustomerIssueKind } from "@sellbridge/shared/schemas";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../client.ts";
import { adminAuditEvents, customerIssueTriage, user, userActivity } from "../schema/index.ts";

export type AdminEventDetails = Record<string, string | number | boolean | null>;

export interface AdminEvent {
  id: string;
  action: string;
  details: AdminEventDetails | null;
  createdAt: Date;
  adminName: string | null;
}

export interface IssueTriage {
  userId: string;
  issueKind: CustomerIssueKind;
  assigneeId: string | null;
  assigneeName: string | null;
  snoozedUntil: Date | null;
}

/** Keeps a trail of what an admin did to a customer's account. */
export async function recordAdminEvent(
  database: Database,
  event: { adminId: string; userId: string; action: string; details?: AdminEventDetails },
): Promise<void> {
  await database.insert(adminAuditEvents).values({
    adminId: event.adminId,
    userId: event.userId,
    action: event.action,
    details: event.details ?? null,
  });
}

export async function listAdminEvents(
  database: Database,
  userId: string,
  limit: number,
): Promise<AdminEvent[]> {
  const admin = alias(user, "admin");
  return database
    .select({
      id: adminAuditEvents.id,
      action: adminAuditEvents.action,
      details: adminAuditEvents.details,
      createdAt: adminAuditEvents.createdAt,
      adminName: admin.name,
    })
    .from(adminAuditEvents)
    .leftJoin(admin, eq(admin.id, adminAuditEvents.adminId))
    .where(eq(adminAuditEvents.userId, userId))
    .orderBy(desc(adminAuditEvents.createdAt))
    .limit(limit);
}

/** Moves the user's last sign-in forward; an older timestamp never overwrites a newer one. */
export async function touchUserActivity(
  database: Database,
  userId: string,
  seenAt: Date = new Date(),
): Promise<void> {
  await database
    .insert(userActivity)
    .values({ userId, lastSeenAt: seenAt })
    .onConflictDoUpdate({
      target: userActivity.userId,
      set: { lastSeenAt: sql`greatest(${userActivity.lastSeenAt}, excluded.last_seen_at)` },
    });
}

export async function assignIssue(
  database: Database,
  triage: { userId: string; issueKind: CustomerIssueKind; assigneeId: string | null },
): Promise<void> {
  await database
    .insert(customerIssueTriage)
    .values(triage)
    .onConflictDoUpdate({
      target: [customerIssueTriage.userId, customerIssueTriage.issueKind],
      set: { assigneeId: triage.assigneeId },
    });
}

export async function snoozeIssue(
  database: Database,
  triage: { userId: string; issueKind: CustomerIssueKind; snoozedUntil: Date | null },
): Promise<void> {
  await database
    .insert(customerIssueTriage)
    .values(triage)
    .onConflictDoUpdate({
      target: [customerIssueTriage.userId, customerIssueTriage.issueKind],
      set: { snoozedUntil: triage.snoozedUntil },
    });
}

/** Every triage decision the team has made; the table holds one row per customer and kind. */
export async function listIssueTriage(database: Database): Promise<IssueTriage[]> {
  const assignee = alias(user, "assignee");
  return database
    .select({
      userId: customerIssueTriage.userId,
      issueKind: customerIssueTriage.issueKind,
      assigneeId: customerIssueTriage.assigneeId,
      assigneeName: assignee.name,
      snoozedUntil: customerIssueTriage.snoozedUntil,
    })
    .from(customerIssueTriage)
    .leftJoin(assignee, eq(assignee.id, customerIssueTriage.assigneeId));
}
