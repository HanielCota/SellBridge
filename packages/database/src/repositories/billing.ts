import { effectiveBillingPlan } from "@sellbridge/shared/billing";
import { and, eq, count, ne, sql } from "drizzle-orm";
import { forbiddenError } from "@sellbridge/shared/errors";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  billingAccounts,
  billingEvents,
  member,
  organization,
  listingTargets,
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

/**
 * Serializes opening a checkout per tenant with a transaction-scoped advisory lock. It holds no
 * row, so publishing and connecting stores never wait on Stripe (item 16.a, N5). False when
 * another checkout of the same tenant is still being opened.
 */
export async function tryLockBillingCheckout(
  database: DatabaseExecutor,
  tenantId: string,
): Promise<boolean> {
  const rows = await database.execute(
    sql`select pg_try_advisory_xact_lock(hashtext('billing-checkout'), hashtext(${tenantId})) as locked`,
  );
  return rows[0]?.locked === true;
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

/**
 * Stores not disconnected, and live publications: one per destination store, failed ones left
 * out (item 16, N7). A disconnected store keeps its slots: its publications come back alive on
 * reconnect, which only checks the store limit.
 */
export async function billingUsage(database: DatabaseExecutor, tenantId: string) {
  const [listingCounts, storeCounts] = await Promise.all([
    database
      .select({ value: count() })
      .from(listingTargets)
      .where(and(eq(listingTargets.tenantId, tenantId), ne(listingTargets.status, "error"))),
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
    /** When the state was read from Stripe, in Unix milliseconds: the newest read wins. */
    observedAt: number;
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
  if (!event || account.lastEventCreated > input.observedAt) return;
  await database
    .update(billingAccounts)
    .set({
      subscriptionId: input.subscriptionId,
      plan: input.plan,
      status: input.status,
      periodEnd: input.periodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      lastEventCreated: input.observedAt,
    })
    .where(eq(billingAccounts.tenantId, account.tenantId));
}

/**
 * Refuses when `requested` more stores or listing slots would pass the plan. A listing asks one
 * slot per destination store; a batch asks for all of its slots at once, so it is refused whole
 * instead of stopping halfway at the limit.
 */
export async function assertBillingCapacity(
  database: DatabaseExecutor,
  tenantId: string,
  resource: "stores" | "listings",
  requested = 1,
) {
  await lockBillingTenant(database, tenantId);
  const account = await getBillingAccount(database, tenantId);
  const plan = effectiveBillingPlan(account);
  const usage = await billingUsage(database, tenantId);
  if (usage[resource] + requested > plan[resource]) {
    throw forbiddenError(
      `Limite do plano ${plan.name} atingido. Gerencie sua assinatura para ampliar ${resource === "stores" ? "as lojas" : "os anúncios"}.`,
    );
  }
}

/** The account bound to a Stripe customer, or null for customers outside this application. */
export async function findBillingCustomer(database: DatabaseExecutor, customerId: string) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.customerId, customerId));
  return account ?? null;
}
