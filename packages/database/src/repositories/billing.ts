import { effectiveBillingPlan } from "@sellbridge/shared/billing";
import { and, eq, count, ne } from "drizzle-orm";
import { forbiddenError } from "@sellbridge/shared/errors";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  billingAccounts,
  billingEvents,
  member,
  organization,
  listings,
  storeConnections,
} from "../schema/index.ts";

export async function getBillingAccount(database: DatabaseExecutor, tenantId: string) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.tenantId, tenantId));
  return account ?? null;
}

export async function requireBillingOwner(database: Database, tenantId: string, userId: string) {
  const [membership] = await database
    .select()
    .from(member)
    .where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)));
  if (!membership || membership.role !== "owner")
    throw forbiddenError("Somente o proprietário pode gerenciar a assinatura");
}

export async function lockBillingTenant(database: DatabaseExecutor, tenantId: string) {
  await database
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, tenantId))
    .for("update");
}

export async function saveBillingCustomer(
  database: DatabaseExecutor,
  tenantId: string,
  customerId: string,
) {
  await database
    .insert(billingAccounts)
    .values({ tenantId, customerId })
    .onConflictDoUpdate({ target: billingAccounts.tenantId, set: { customerId } });
}

export async function billingUsage(database: DatabaseExecutor, tenantId: string) {
  const [listingCounts, storeCounts] = await Promise.all([
    database.select({ value: count() }).from(listings).where(eq(listings.tenantId, tenantId)),
    database
      .select({ value: count() })
      .from(storeConnections)
      .where(
        and(eq(storeConnections.tenantId, tenantId), ne(storeConnections.status, "disconnected")),
      ),
  ]);
  return { listings: listingCounts[0]?.value ?? 0, stores: storeCounts[0]?.value ?? 0 };
}

export async function applyBillingEvent(
  database: DatabaseExecutor,
  input: {
    eventId: string;
    eventCreated: number;
    customerId: string;
    subscriptionId: string;
    plan: string;
    status: string;
    periodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  },
) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.customerId, input.customerId))
    .for("update");
  if (!account) return;
  const [event] = await database
    .insert(billingEvents)
    .values({ id: input.eventId })
    .onConflictDoNothing()
    .returning();
  if (!event || account.lastEventCreated > input.eventCreated) return;
  await database
    .update(billingAccounts)
    .set({
      subscriptionId: input.subscriptionId,
      plan: input.plan,
      status: input.status,
      periodEnd: input.periodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      lastEventCreated: input.eventCreated,
    })
    .where(eq(billingAccounts.tenantId, account.tenantId));
}

export async function assertBillingCapacity(
  database: DatabaseExecutor,
  tenantId: string,
  resource: "stores" | "listings",
) {
  await lockBillingTenant(database, tenantId);
  const account = await getBillingAccount(database, tenantId);
  const plan = effectiveBillingPlan(account);
  const usage = await billingUsage(database, tenantId);
  if (usage[resource] >= plan[resource]) {
    throw forbiddenError(
      `Limite do plano ${plan.name} atingido. Gerencie sua assinatura para ampliar ${resource === "stores" ? "as lojas" : "os anúncios"}.`,
    );
  }
}

export async function lockBillingCustomer(database: DatabaseExecutor, customerId: string) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.customerId, customerId))
    .for("update");
  return account ?? null;
}
