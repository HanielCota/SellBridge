import {
  billingAccess,
  billingLimits,
  FREE_SALE_LIMIT,
  FREE_SALES_EXHAUSTED_MESSAGE,
  type BillingPlanId,
  type BillingRules,
} from "@sellbridge/shared/billing";
import { and, eq, count, desc, isNotNull, ne, sql } from "drizzle-orm";
import { forbiddenError } from "@sellbridge/shared/errors";
import type { Database, DatabaseExecutor } from "../client.ts";
import {
  billingAccounts,
  billingCourtesies,
  billingEvents,
  member,
  organization,
  user,
  listingTargets,
  orders,
  storeConnections,
} from "../schema/index.ts";

export async function getBillingAccount(database: DatabaseExecutor, tenantId: string) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.tenantId, tenantId));
  return account ?? null;
}

/** The plan the team gave the tenant with no charge, in force or already over; null without one. */
export async function getBillingCourtesy(database: DatabaseExecutor, tenantId: string) {
  const [courtesy] = await database
    .select()
    .from(billingCourtesies)
    .where(eq(billingCourtesies.tenantId, tenantId));
  return courtesy ?? null;
}

/** Gives the tenant a courtesy plan, or replaces the one it has. */
export async function saveBillingCourtesy(
  database: DatabaseExecutor,
  courtesy: {
    tenantId: string;
    plan: BillingPlanId;
    /** The first moment without the plan; null never runs out. */
    expiresAt: Date | null;
    reason: string;
    grantedBy: string;
  },
) {
  const { plan, expiresAt, reason, grantedBy } = courtesy;
  await database
    .insert(billingCourtesies)
    .values(courtesy)
    .onConflictDoUpdate({
      target: billingCourtesies.tenantId,
      set: { plan, expiresAt, reason, grantedBy, grantedAt: new Date() },
    });
}

/** Takes the courtesy plan back. False when the tenant had none. */
export async function deleteBillingCourtesy(
  database: DatabaseExecutor,
  tenantId: string,
): Promise<boolean> {
  const deleted = await database
    .delete(billingCourtesies)
    .where(eq(billingCourtesies.tenantId, tenantId))
    .returning({ tenantId: billingCourtesies.tenantId });
  return deleted.length > 0;
}

export async function requireBillingOwner(database: Database, tenantId: string, userId: string) {
  const [membership] = await database
    .select()
    .from(member)
    .where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)));
  if (!membership || membership.role !== "owner")
    throw forbiddenError("Só o dono da conta pode mudar a assinatura.");
}

/** Serializes capacity and sale-slot checks without blocking foreign key references to the tenant. */
export async function lockBillingTenant(database: DatabaseExecutor, tenantId: string) {
  const [tenant] = await database
    .select({ createdAt: organization.createdAt })
    .from(organization)
    .where(eq(organization.id, tenantId))
    .for("no key update");
  if (tenant === undefined)
    throw forbiddenError(
      "Não achamos a sua conta. Saia e entre de novo; se continuar, fale com o suporte.",
    );
  return tenant.createdAt;
}

/** When the tenant was created: accounts from before the launch get the transition. */
export async function findBillingTenantCreatedAt(database: DatabaseExecutor, tenantId: string) {
  const [tenant] = await database
    .select({ createdAt: organization.createdAt })
    .from(organization)
    .where(eq(organization.id, tenantId));
  if (tenant === undefined)
    throw forbiddenError(
      "Não achamos a sua conta. Saia e entre de novo; se continuar, fale com o suporte.",
    );
  return tenant.createdAt;
}

/** The highest assigned slot is the number of free sales already used. */
async function billingFreeSalesUsed(database: DatabaseExecutor, tenantId: string) {
  const [last] = await database
    .select({ slot: orders.freeSaleSlot })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), isNotNull(orders.freeSaleSlot)))
    .orderBy(desc(orders.freeSaleSlot))
    .limit(1);
  return last?.slot ?? 0;
}

/** Called while holding the billing tenant lock, before recording the first payment. */
export async function nextFreeSaleSlot(database: DatabaseExecutor, tenantId: string) {
  const used = await billingFreeSalesUsed(database, tenantId);
  return used < FREE_SALE_LIMIT ? used + 1 : null;
}

export async function findBillingAccessInput(
  database: DatabaseExecutor,
  tenantId: string,
  rules: BillingRules,
  lockedTenantCreatedAt?: Date,
) {
  const [tenantCreatedAt, account, courtesy, freeSalesUsed] = await Promise.all([
    lockedTenantCreatedAt ?? findBillingTenantCreatedAt(database, tenantId),
    getBillingAccount(database, tenantId),
    getBillingCourtesy(database, tenantId),
    billingFreeSalesUsed(database, tenantId),
  ]);
  return {
    subscription: account,
    courtesy,
    tenantCreatedAt,
    transition: rules.transition,
    freeSalesUsed,
  };
}

export async function findBillingAccess(
  database: DatabaseExecutor,
  tenantId: string,
  rules: BillingRules,
) {
  return billingAccess(await findBillingAccessInput(database, tenantId, rules));
}

export async function assertBillingSaleAccess(
  database: DatabaseExecutor,
  tenantId: string,
  rules: BillingRules,
  lockedTenantCreatedAt?: Date,
): Promise<void> {
  const input = await findBillingAccessInput(database, tenantId, rules, lockedTenantCreatedAt);
  const access = billingAccess(input);
  if (access.kind === "none") {
    throw forbiddenError(
      input.freeSalesUsed === FREE_SALE_LIMIT
        ? FREE_SALES_EXHAUSTED_MESSAGE
        : "Para continuar com novas vendas, regularize seu plano em Assinatura.",
    );
  }
}

/**
 * Serializes subscription changes per tenant with a transaction-scoped advisory lock. It holds no
 * row, so publishing and connecting stores never wait on the payment provider (item 16.a, N5).
 * False when another change of the same tenant is still running.
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

/**
 * Turning on a subscription's service invoice, one run per subscription: two at once could each
 * schedule the invoice of the same paid charge. False when another run holds it.
 */
export async function tryLockSubscriptionInvoices(
  database: DatabaseExecutor,
  subscriptionId: string,
): Promise<boolean> {
  const rows = await database.execute(
    sql`select pg_try_advisory_xact_lock(hashtext('billing-invoices'), hashtext(${subscriptionId})) as locked`,
  );
  return rows[0]?.locked === true;
}

/** Every account bound to a subscription, for the one-off pass over existing subscriptions. */
export async function listSubscribedBillingAccounts(database: DatabaseExecutor) {
  return database
    .select({
      tenantId: billingAccounts.tenantId,
      subscriptionId: billingAccounts.subscriptionId,
      customerId: billingAccounts.customerId,
      plan: billingAccounts.plan,
    })
    .from(billingAccounts)
    .where(isNotNull(billingAccounts.subscriptionId));
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

/**
 * Refuses when `requested` more stores or listing slots would pass the plan. A listing asks one
 * slot per destination store; a batch asks for all of its slots at once, so it is refused whole
 * instead of stopping halfway at the limit. The free offer uses the entry plan's capacity.
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
  const access = billingAccess(
    await findBillingAccessInput(database, tenantId, input.rules, tenantCreatedAt),
  );
  const limits = billingLimits(access);
  if (limits === null) return;
  const usage = await billingUsage(database, tenantId);
  if (usage[resource] + requested <= limits[resource]) return;
  const what = resource === "stores" ? "conectar lojas" : "publicar anúncios";
  if (access.kind === "free") {
    throw forbiddenError(
      `Limite do plano gratuito atingido. Para ${what}, veja os planos em Assinatura.`,
    );
  }

  if (access.kind !== "plan") {
    throw forbiddenError(`Para ${what}, escolha um plano em Assinatura.`);
  }
  throw forbiddenError(
    `Limite do plano ${access.plan.name} atingido. Para ${what}, mude para um plano maior em Assinatura.`,
  );
}

/** The columns a subscription change writes; the rest of the row stays as it is. */
export type BillingAccountPatch = Partial<
  Pick<
    typeof billingAccounts.$inferInsert,
    | "customerId"
    | "subscriptionId"
    | "plan"
    | "status"
    | "periodEnd"
    | "cancelAtPeriodEnd"
    | "paymentMethod"
    | "scheduledPlan"
    | "scheduledPlanAt"
    | "pendingPlan"
    | "pendingReference"
    | "prepaidUntil"
    | "firstPaidOn"
  >
>;

/** Writes part of the tenant's billing account, creating the row on the first write. */
export async function saveBillingAccount(
  database: DatabaseExecutor,
  tenantId: string,
  patch: BillingAccountPatch,
) {
  await database
    .insert(billingAccounts)
    .values({ tenantId, ...patch })
    .onConflictDoUpdate({ target: billingAccounts.tenantId, set: patch });
}

/**
 * Applies a state read from the provider. A notice delivered twice is applied once, and a read
 * that started before the one already stored never overwrites it.
 */
export async function applyBillingState(
  database: DatabaseExecutor,
  input: {
    tenantId: string;
    /** The provider's notice id; null when the state was read on the reseller's visit. */
    eventId: string | null;
    /** When the state was read from the provider, in Unix milliseconds. */
    observedAt: number;
    patch: BillingAccountPatch;
  },
): Promise<boolean> {
  const [account] = await database
    .select({ lastEventCreated: billingAccounts.lastEventCreated })
    .from(billingAccounts)
    .where(eq(billingAccounts.tenantId, input.tenantId))
    .for("update");
  if (account === undefined || account.lastEventCreated > input.observedAt) return false;
  if (input.eventId !== null) {
    const [event] = await database
      .insert(billingEvents)
      .values({ id: input.eventId })
      .onConflictDoNothing()
      .returning();
    if (event === undefined) return false;
  }
  await database
    .update(billingAccounts)
    .set({ ...input.patch, lastEventCreated: input.observedAt })
    .where(eq(billingAccounts.tenantId, input.tenantId));
  return true;
}

/** The account bound to a subscription, or null for subscriptions outside this application. */
export async function findBillingAccountBySubscription(
  database: DatabaseExecutor,
  subscriptionId: string,
) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.subscriptionId, subscriptionId));
  return account ?? null;
}

/** The account waiting on a card checkout or an upgrade charge. */
export async function findBillingAccountByPendingReference(
  database: DatabaseExecutor,
  reference: string,
) {
  const [account] = await database
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.pendingReference, reference));
  return account ?? null;
}

/**
 * Settles what the account waits on, with `patch` (the plan it paid for, say), only while it
 * still waits on `reference`: what was opened meanwhile is never erased, and a settlement
 * delivered twice applies once. True when this call settled it.
 */
export async function settlePendingReference(
  database: DatabaseExecutor,
  input: { tenantId: string; reference: string; patch?: BillingAccountPatch },
): Promise<boolean> {
  const { tenantId, reference, patch = {} } = input;
  const cleared = await database
    .update(billingAccounts)
    .set({ ...patch, pendingPlan: null, pendingReference: null })
    .where(
      and(eq(billingAccounts.tenantId, tenantId), eq(billingAccounts.pendingReference, reference)),
    )
    .returning({ tenantId: billingAccounts.tenantId });
  return cleared.length > 0;
}

/** The owner's e-mail: the payment provider sends the monthly charges there. */
export async function findBillingOwnerEmail(
  database: DatabaseExecutor,
  tenantId: string,
): Promise<string | null> {
  const [owner] = await database
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, tenantId), eq(member.role, "owner")))
    .limit(1);
  return owner?.email ?? null;
}
