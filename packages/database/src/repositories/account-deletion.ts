import { conflictError } from "@sellbridge/shared/errors";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { isSerializationFailure } from "../postgres-errors.ts";
import {
  billingAccounts,
  erpCatalogReads,
  erpOAuthStates,
  member,
  organization,
  supplierErpConnections,
  paymentOAuthStates,
  supplierPaymentAccounts,
  suppliers,
  ticketAttachments,
  ticketMessages,
  tickets,
} from "../schema/index.ts";
import { assertWorkspaceCanBeDeleted } from "./account-deletion-blockers.ts";

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
 * CPF all cascade from the organization. A supplier's catalog outlives the workspace (it is only
 * detached), so its ERP and payment account tokens, its ERP catalog read and pending states are
 * deleted with it here, and its store is closed for sales until the team takes it over.
 */
export async function deleteTenantData(database: Database, tenantId: string): Promise<void> {
  try {
    await deleteWorkspace(database, tenantId);
  } catch (error) {
    if (isSerializationFailure(error)) {
      throw conflictError(
        "O perfil mudou durante a exclusão. Confira as pendências e tente de novo.",
      );
    }

    throw error;
  }
}

async function deleteWorkspace(database: Database, tenantId: string): Promise<void> {
  await database.transaction(
    async (transaction) => {
      const [workspace] = await transaction
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, tenantId))
        .for("update");
      if (workspace === undefined) {
        return;
      }

      // Keep new orders and parcels from taking a reference while the final check runs.
      await transaction
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.organizationId, tenantId))
        .for("update");
      await assertWorkspaceCanBeDeleted(transaction, tenantId);

      const ranSupplier = transaction
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.organizationId, tenantId));
      await transaction
        .delete(supplierErpConnections)
        .where(inArray(supplierErpConnections.supplierId, ranSupplier));
      await transaction
        .delete(erpCatalogReads)
        .where(inArray(erpCatalogReads.supplierId, ranSupplier));
      await transaction
        .delete(erpOAuthStates)
        .where(inArray(erpOAuthStates.supplierId, ranSupplier));
      await transaction
        .delete(supplierPaymentAccounts)
        .where(inArray(supplierPaymentAccounts.supplierId, ranSupplier));
      await transaction
        .delete(paymentOAuthStates)
        .where(inArray(paymentOAuthStates.supplierId, ranSupplier));
      // No one ships or receives for the catalog anymore: its resellers' listings go to zero stock.
      await transaction
        .update(suppliers)
        .set({ salesClosedAt: sql`coalesce(${suppliers.salesClosedAt}, now())` })
        .where(eq(suppliers.organizationId, tenantId));
      await transaction.delete(organization).where(eq(organization.id, tenantId));
    },
    { isolationLevel: "serializable" },
  );
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
