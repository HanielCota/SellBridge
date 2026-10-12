import {
  assignIssue,
  disconnectStore,
  findTenantRegion,
  getCustomer,
  getSalesSummary,
  getWeeklyOrderCounts,
  isEmailTakenByOther,
  listAdminEvents,
  listCustomerSignals,
  listIssueTriage,
  listStoreConnections,
  listTenantTickets,
  MAX_CUSTOMERS_RANKED,
  recordAdminEvent,
  saveTenantRegion,
  snoozeIssue,
  type AdminEventDetails,
} from "@sellbridge/database/repositories";
import { assessCustomerHealth } from "@sellbridge/shared/customer-health";
import { MARKETPLACE_LABELS } from "@sellbridge/marketplaces";
import { conflictError, forbiddenError, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  assignCustomerIssueSchema,
  customerIdSchema,
  customerIssuesSearchSchema,
  customersSearchSchema,
  disconnectCustomerStoreSchema,
  periodSearchSchema,
  setCustomerBanSchema,
  setCustomerRoleSchema,
  snoozeCustomerIssueSchema,
  updateCustomerProfileSchema,
  updateCustomerRegionSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth, isAdminEmail } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { sendEmail } from "@/lib/server/mailer";
import { adminMiddleware } from "@/lib/server/middleware";
import { resolveCep } from "@/features/region/region.server";
import { buildReportScope } from "@/features/reports/report-scope.server";
import type { AdminAction } from "./admin-actions";
import {
  buildJourney,
  countIssues,
  countQueues,
  filterQueue,
  indexTriage,
  ISSUE_QUEUE_LIMIT,
  listIssueEntries,
  pageOfCustomers,
  rankCustomers,
} from "./customer-ranking";
import { onboardingReminderEmail } from "./onboarding-reminder";

/** Weeks of orders behind the sparkline in a customer's quick view. */
const ACTIVITY_WEEKS = 8;
/** Admin actions shown in a customer's timeline. */
const TIMELINE_EVENTS = 8;
const DAY_MILLISECONDS = 86_400_000;

async function requireCustomer(userId: string) {
  const customer = await getCustomer(database, userId);
  if (!customer) {
    throw notFoundError("Cliente não encontrado");
  }
  return customer;
}

async function requireCustomerTenant(userId: string): Promise<string> {
  const customer = await requireCustomer(userId);
  if (!customer.tenantId) {
    throw notFoundError("Este cliente ainda não tem uma organização");
  }
  return customer.tenantId;
}

/** Admins can't lock themselves out by demoting or blocking their own account. */
function assertNotSelf(adminId: string, userId: string, action: string): void {
  if (adminId === userId) {
    throw forbiddenError(`Você não pode ${action} a sua própria conta`);
  }
}

/** Logs the action and adds it to the customer's timeline. */
async function recordAdminAction(
  adminId: string,
  userId: string,
  action: AdminAction,
  details?: AdminEventDetails,
): Promise<void> {
  logger.info(`admin.customer_${action}`, { adminId, userId, ...details });
  await recordAdminEvent(database, { adminId, userId, action, ...(details ? { details } : {}) });
}

async function loadRankedCustomers(search: string | undefined) {
  const now = new Date();
  const rows = await listCustomerSignals(database, { search }, now);
  if (rows.length >= MAX_CUSTOMERS_RANKED) {
    // Past the cap the ranking only sees the newest accounts: time to move it into SQL.
    logger.warn("admin.customer_ranking_capped", { limit: MAX_CUSTOMERS_RANKED });
  }
  return rankCustomers(rows, now);
}

export const adminListCustomers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(customersSearchSchema)
  .handler(async ({ data }) => {
    const customers = await loadRankedCustomers(data.query);
    const page = pageOfCustomers(customers, data);
    return {
      ...page,
      issueCounts: countIssues(customers),
      needingAttention: customers.filter((customer) => customer.health.issues.length > 0).length,
      customerCount: customers.length,
    };
  });

export const adminListCustomerIssues = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(customerIssuesSearchSchema)
  .handler(async ({ context, data }) => {
    const now = new Date();
    const [customers, triage] = await Promise.all([
      loadRankedCustomers(data.query),
      listIssueTriage(database),
    ]);
    const entries = listIssueEntries(customers, { kind: data.issue, triage: indexTriage(triage) });
    const queue = filterQueue(entries, data.queue, context.userId, now);
    return {
      entries: queue.slice(0, ISSUE_QUEUE_LIMIT),
      total: queue.length,
      issueCounts: countIssues(customers),
      queueCounts: countQueues(entries, context.userId, now),
    };
  });

export const adminCustomerJourney = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(customerIssuesSearchSchema.pick({ query: true }))
  .handler(async ({ data }) => buildJourney(await loadRankedCustomers(data.query)));

export const adminGetCustomer = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(customerIdSchema)
  .handler(async ({ data }) => {
    const [customer, events] = await Promise.all([
      requireCustomer(data.userId),
      listAdminEvents(database, data.userId, TIMELINE_EVENTS),
    ]);
    const health = assessCustomerHealth(customer);
    if (!customer.tenantId) {
      return {
        customer,
        health,
        events,
        region: null,
        stores: [],
        summary: null,
        openTickets: 0,
        weeklyOrders: Array.from({ length: ACTIVITY_WEEKS }, () => 0),
      };
    }
    const { scope } = buildReportScope(
      customer.tenantId,
      periodSearchSchema.parse({ period: "30d" }),
    );
    const [region, stores, summary, tickets, weeklyOrders] = await Promise.all([
      findTenantRegion(database, customer.tenantId),
      listStoreConnections(database, customer.tenantId),
      getSalesSummary(database, scope),
      listTenantTickets(database, customer.tenantId, { status: "open" }, { page: 1, pageSize: 1 }),
      getWeeklyOrderCounts(database, customer.tenantId, ACTIVITY_WEEKS),
    ]);
    return {
      customer,
      health,
      events,
      weeklyOrders,
      region,
      stores: stores.map((store) => ({
        id: store.id,
        shopName: store.shopName,
        marketplace: store.marketplace,
        marketplaceLabel: MARKETPLACE_LABELS[store.marketplace],
        status: store.status,
      })),
      summary,
      openTickets: tickets.total,
    };
  });

export const adminUpdateCustomerProfile = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(updateCustomerProfileSchema)
  .handler(async ({ context, data }) => {
    await requireCustomer(data.userId);
    const email = data.email.toLowerCase();
    if (await isEmailTakenByOther(database, email, data.userId)) {
      throw conflictError("Já existe outra conta com este e-mail");
    }
    await auth.api.adminUpdateUser({
      body: { userId: data.userId, data: { name: data.name, email } },
      headers: getRequestHeaders(),
    });
    await recordAdminAction(context.userId, data.userId, "profile_updated");
    return { ok: true };
  });

export const adminSetCustomerRole = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(setCustomerRoleSchema)
  .handler(async ({ context, data }) => {
    assertNotSelf(context.userId, data.userId, "alterar o papel de");
    const customer = await requireCustomer(data.userId);
    // ADMIN_EMAILS addresses are promoted back on every update (auth.ts), wiping the password
    // and sessions on the way; the role of those accounts is set in the environment instead.
    if (data.role !== "admin" && isAdminEmail(customer.email)) {
      throw conflictError(
        "Este e-mail está em ADMIN_EMAILS e é sempre administrador. Tire-o da variável para mudar o papel.",
      );
    }
    await auth.api.setRole({
      body: { userId: data.userId, role: data.role },
      headers: getRequestHeaders(),
    });
    await recordAdminAction(context.userId, data.userId, "role_changed", { role: data.role });
    return { ok: true };
  });

async function applyBan(data: { userId: string; banned: boolean; reason?: string | undefined }) {
  const headers = getRequestHeaders();
  if (!data.banned) {
    await auth.api.unbanUser({ body: { userId: data.userId }, headers });
    return;
  }
  await auth.api.banUser({
    body: { userId: data.userId, banReason: data.reason ?? "Bloqueado pelo administrador" },
    headers,
  });
}

export const adminSetCustomerBan = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(setCustomerBanSchema)
  .handler(async ({ context, data }) => {
    assertNotSelf(context.userId, data.userId, "bloquear");
    await requireCustomer(data.userId);
    await applyBan(data);
    await recordAdminAction(context.userId, data.userId, "ban_changed", { banned: data.banned });
    return { ok: true };
  });

export const adminRevokeCustomerSessions = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(customerIdSchema)
  .handler(async ({ context, data }) => {
    await requireCustomer(data.userId);
    await auth.api.revokeUserSessions({
      body: { userId: data.userId },
      headers: getRequestHeaders(),
    });
    await recordAdminAction(context.userId, data.userId, "sessions_revoked");
    return { ok: true };
  });

export const adminSendCustomerPasswordReset = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(customerIdSchema)
  .handler(async ({ context, data }) => {
    const customer = await requireCustomer(data.userId);
    await auth.api.requestPasswordReset({
      body: { email: customer.email, redirectTo: "/redefinir-senha" },
    });
    await recordAdminAction(context.userId, data.userId, "password_reset_sent");
    return { ok: true };
  });

export const adminSendOnboardingReminder = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(customerIdSchema)
  .handler(async ({ context, data }) => {
    const customer = await requireCustomer(data.userId);
    const { nextStep } = assessCustomerHealth(customer);
    if (!nextStep) {
      throw conflictError("Este cliente já concluiu os primeiros passos");
    }
    await sendEmail(onboardingReminderEmail(customer, nextStep, environment.APP_URL));
    await recordAdminAction(context.userId, data.userId, "onboarding_reminder_sent", {
      step: nextStep,
    });
    return { ok: true };
  });

export const adminUpdateCustomerRegion = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(updateCustomerRegionSchema)
  .handler(async ({ context, data }) => {
    const tenantId = await requireCustomerTenant(data.userId);
    const address = await resolveCep(data.cep);
    const region = await saveTenantRegion(database, tenantId, address);
    await recordAdminAction(context.userId, data.userId, "region_updated", {
      state: region.state,
    });
    return region;
  });

export const adminDisconnectCustomerStore = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(disconnectCustomerStoreSchema)
  .handler(async ({ context, data }) => {
    const tenantId = await requireCustomerTenant(data.userId);
    await disconnectStore(database, tenantId, data.storeConnectionId);
    await recordAdminAction(context.userId, data.userId, "store_disconnected", {
      storeConnectionId: data.storeConnectionId,
    });
    return { ok: true };
  });

export const adminAssignCustomerIssue = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(assignCustomerIssueSchema)
  .handler(async ({ context, data }) => {
    await requireCustomer(data.userId);
    await assignIssue(database, {
      userId: data.userId,
      issueKind: data.issue,
      assigneeId: data.take ? context.userId : null,
    });
    const action = data.take ? "issue_assigned" : "issue_released";
    await recordAdminAction(context.userId, data.userId, action, { issue: data.issue });
    return { ok: true };
  });

export const adminSnoozeCustomerIssue = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(snoozeCustomerIssueSchema)
  .handler(async ({ context, data }) => {
    await requireCustomer(data.userId);
    const snoozedUntil = data.days ? new Date(Date.now() + data.days * DAY_MILLISECONDS) : null;
    await snoozeIssue(database, { userId: data.userId, issueKind: data.issue, snoozedUntil });
    const action = data.days ? "issue_snoozed" : "issue_unsnoozed";
    await recordAdminAction(context.userId, data.userId, action, {
      issue: data.issue,
      days: data.days,
    });
    return { ok: true };
  });
