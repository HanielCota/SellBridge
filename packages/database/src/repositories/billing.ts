import { billingAccess, billingLimits, type BillingRules } from "@sellbridge/shared/billing";
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

/** Locks the tenant for a capacity check and returns when it was created (for the transition). */
export async function lockBillingTenant(database: DatabaseExecutor, tenantId: string) {
  const [tenant] = await database
    .select({ createdAt: organization.createdAt })
    .from(organization)
    .where(eq(organization.id, tenantId))
    .for("update");
  if (tenant === undefined) throw forbiddenError("Organização não encontrada");
  return tenant.createdAt;
}

/** When the tenant was created: accounts from before the launch get the transition. */
export async function findBillingTenantCreatedAt(database: DatabaseExecutor, tenantId: string) {
  const [tenant] = await database
    .select({ createdAt: organization.createdAt })
    .from(organization)
    .where(eq(organization.id, tenantId));
  if (tenant === undefined) throw forbiddenError("Organização não encontrada");
  return tenant.createdAt;
}

/** What the tenant may use now under the billing rules: a plan, the launch transition or nothing. */
export async function findBillingAccess(
  database: DatabaseExecutor,
  tenantId: string,
  rules: BillingRules,
) {
  const [tenantCreatedAt, account] = await Promise.all([
    findBillingTenantCreatedAt(database, tenantId),
    getBillingAccount(database, tenantId),
  ]);
  return billingAccess({ subscription: account, tenantCreatedAt, transition: rules.transition });
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
        and(
          eq(storeConnections.tenantId, tenantId),
          ne(storeConnections.status, "disconnected"),
          eq(storeConnections.manual, false),
        ),
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
 * instead of stopping halfway at the limit. Without a plan (and outside the launch transition)
 * nothing new fits: there is no free plan.
 */
export async function assertBillingCapacity(
  database: DatabaseExecutor,
  input: {
    tenantId: string;
    rules: BillingRules;
    resource: "stores" | "listings";
    requested?: number;
  },
) {
  const { tenantId, resource, requested = 1 } = input;
  // Asking for nothing never passes the plan, even for a tenant already over it after a downgrade.
  if (requested <= 0) {
    return;
  }
  const tenantCreatedAt = await lockBillingTenant(database, tenantId);
  const account = await getBillingAccount(database, tenantId);
  const access = billingAccess({
    subscription: account,
    tenantCreatedAt,
    transition: input.rules.transition,
  });
  const limits = billingLimits(access);
  if (limits === null) return;
  const usage = await billingUsage(database, tenantId);
  if (usage[resource] + requested <= limits[resource]) return;
  const what = resource === "stores" ? "conectar lojas" : "publicar anúncios";
  if (access.kind !== "plan") {
    throw forbiddenError(`Para ${what}, escolha um plano em Assinatura.`);
  }
  throw forbiddenError(
    `Limite do plano ${access.plan.name} atingido. Para ${what}, mude para um plano maior em Assinatura.`,
  );
}

/** The account bound to a Stripe customer, or null for customers outside this application. */
export async function findBillingCustomer(database: DatabaseExecutor, customerId: string) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.customerId, customerId));
  return account ?? null;
}
