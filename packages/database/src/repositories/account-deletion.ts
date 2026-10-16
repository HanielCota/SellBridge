import { and, eq, inArray, ne, or } from "drizzle-orm";
import type { Database } from "../client.ts";
import {
  billingAccounts,
  member,
  organization,
  ticketAttachments,
  ticketMessages,
  tickets,
} from "../schema/index.ts";

/** Workspaces where the user is the only owner: they go with the account. */
export async function findSoleOwnedTenants(database: Database, userId: string): Promise<string[]> {
  const owned = await database
    .select({ tenantId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));
  if (owned.length === 0) {
    return [];
  }
  const ownedIds = owned.map((row) => row.tenantId);
  const shared = await database
    .select({ tenantId: member.organizationId })
    .from(member)
    .where(
      and(
        inArray(member.organizationId, ownedIds),
        eq(member.role, "owner"),
        ne(member.userId, userId),
      ),
    );
  const sharedIds = new Set(shared.map((row) => row.tenantId));
  return ownedIds.filter((tenantId) => !sharedIds.has(tenantId));
}

/**
 * Stored files that go with the account: attachments of its workspaces' tickets and of the
 * tickets it opened elsewhere (those rows cascade from the user). The database cascade never
 * reaches the disk, so they are collected before the rows go.
 */
export async function accountFileKeys(
  database: Database,
  account: { userId: string; tenantIds: readonly string[] },
): Promise<string[]> {
  // Messages the user wrote elsewhere cascade too, taking their attachments' rows with them.
  const ownRows = or(
    eq(tickets.createdById, account.userId),
    eq(ticketMessages.authorId, account.userId),
  );
  const scope =
    account.tenantIds.length === 0
      ? ownRows
      : or(ownRows, inArray(tickets.tenantId, [...account.tenantIds]));
  const rows = await database
    .selectDistinct({ storageKey: ticketAttachments.storageKey })
    .from(ticketAttachments)
    .innerJoin(tickets, eq(tickets.id, ticketAttachments.ticketId))
    .innerJoin(ticketMessages, eq(ticketMessages.id, ticketAttachments.messageId))
    .where(scope);
  return rows.map((row) => row.storageKey);
}

/**
 * Deletes a workspace and everything in it: stores, sales, listings, tickets and the holder's
 * CPF all cascade from the organization in one statement.
 */
export async function deleteTenantData(database: Database, tenantId: string): Promise<void> {
  await database.delete(organization).where(eq(organization.id, tenantId));
}

/**
 * Forgets the workspace's Stripe customer once it is deleted there, so a deletion retried after
 * a later step failed does not ask Stripe for a customer that no longer exists.
 */
export async function forgetBillingCustomer(database: Database, tenantId: string): Promise<void> {
  await database
    .update(billingAccounts)
    .set({ customerId: null, subscriptionId: null, plan: "free", status: "canceled" })
    .where(eq(billingAccounts.tenantId, tenantId));
}
