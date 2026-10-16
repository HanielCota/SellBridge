import {
  assignIssue,
  disableTenantWebhookEndpoints,
  changeStoreSupplier,
  disconnectStore,
  findOnboardingProfile,
  findStoreSuppliers,
  getCustomer,
  getSalesSummary,
  getWeeklyOrderCounts,
  isEmailTakenByOther,
  listAdminEvents,
  listCustomerSignals,
  listActiveSuppliers,
  listIssueTriage,
  listStoreConnections,
  listTenantTickets,
  MAX_CUSTOMERS_RANKED,
  previewStoreSupplierChange,
  recordAdminEvent,
  revokeTenantApiKeys,
  snoozeIssue,
  type OnboardingProfile,
  type StoreConnectionSummary,
  type AdminEventDetails,
  type CustomerSummary,
} from "@sellbridge/database/repositories";
import { assessCustomerHealth } from "@sellbridge/shared/customer-health";
import { MARKETPLACE_LABELS } from "@sellbridge/marketplaces";
import { conflictError, forbiddenError, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  type AccountIdentity,
  canManageAccount,
  isPlatformOwner,
} from "@sellbridge/shared/platform-owner";
import {
  adminStoreSupplierSchema,
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
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { PROTECTED_ACCOUNT_MESSAGE } from "@/lib/server/account-protection";
import { auth, isAdminEmail } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { environment } from "@/lib/server/environment";
import { renderActionEmail } from "@sellbridge/shared/email-layout";
import { sendEmail } from "@/lib/server/mailer";
import { adminMiddleware } from "@/lib/server/middleware";
import { requestStockSync } from "@/lib/server/stock-sync";
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
import { type ProfileSaveSteps, saveCustomerProfile } from "./email-change.server";

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

/**
 * A team account (or one of ADMIN_EMAILS) is only managed by a platform owner: otherwise any
 * admin could change another admin's e-mail, send the reset link to it and sign in as them.
 * The plugin's own routes enforce the same rule (`account-protection.ts`).
 */
async function requireManageableCustomer(actor: AccountIdentity, userId: string) {
  const customer = await requireCustomer(userId);
  if (!canManageAccount(actor, customer, environment.ADMIN_EMAILS)) {
    throw forbiddenError(PROTECTED_ACCOUNT_MESSAGE);
  }
  return customer;
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

/**
 * The ranked customers and whether the list was cut: past the cap the ranking only sees the
 * newest accounts, and the screen must say so instead of reading as the whole base.
 */
async function loadRankedCustomers(search: string | undefined, supplierId?: string) {
  const now = new Date();
  const rows = await listCustomerSignals(database, { search, supplierId }, now);
  const truncated = rows.length > MAX_CUSTOMERS_RANKED;
  if (truncated) {
    // Time to move the ranking into SQL.
    logger.warn("admin.customer_ranking_capped", { limit: MAX_CUSTOMERS_RANKED });
  }
  return { customers: rankCustomers(rows.slice(0, MAX_CUSTOMERS_RANKED), now), truncated };
}

/**
 * The staff screens only learn whether the holder is filled in, never the CPF or the legal name
 * kept for invoices.
 */
function holderStatus(profile: OnboardingProfile) {
  return { hasHolder: profile.holder !== null, starterSupplier: profile.starterSupplier };
}

export const adminListCustomers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(customersSearchSchema)
  .handler(async ({ data }) => {
    const [{ customers, truncated }, suppliers] = await Promise.all([
      loadRankedCustomers(data.query, data.supplier),
      listActiveSuppliers(database, {}),
    ]);
    const page = pageOfCustomers(customers, data);
    return {
      ...page,
      issueCounts: countIssues(customers),
      needingAttention: customers.filter((customer) => customer.health.issues.length > 0).length,
      customerCount: customers.length,
      /** The cap the list stopped at, or null when it holds every matching account. */
      rankingLimit: truncated ? MAX_CUSTOMERS_RANKED : null,
      supplierOptions: suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name })),
    };
  });

export const adminListCustomerIssues = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(customerIssuesSearchSchema)
  .handler(async ({ context, data }) => {
    const now = new Date();
    const [{ customers }, triage] = await Promise.all([
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
  .handler(async ({ data }) => buildJourney((await loadRankedCustomers(data.query)).customers));

/** What the viewing admin may do on this account, for the screen to lock what the server refuses. */
function accountAccess(actor: AccountIdentity, customer: CustomerSummary) {
  return {
    isPlatformOwner: isPlatformOwner(customer, environment.ADMIN_EMAILS),
    canManage: canManageAccount(actor, customer, environment.ADMIN_EMAILS),
    /** Giving a team role is managing the team: only an owner's role picker works. */
    canGrantTeamRoles: isPlatformOwner(actor, environment.ADMIN_EMAILS),
  };
}

export const adminGetCustomer = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(customerIdSchema)
  .handler(async ({ context, data }) => {
    const [customer, events] = await Promise.all([
      requireCustomer(data.userId),
      listAdminEvents(database, data.userId, TIMELINE_EVENTS),
    ]);
    const health = assessCustomerHealth(customer);
    const access = accountAccess(context.actor, customer);
    if (!customer.tenantId) {
      return {
        customer,
        health,
        access,
        events,
        profile: { hasHolder: false, starterSupplier: null },
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
    const [profile, stores, summary, tickets, weeklyOrders] = await Promise.all([
      findOnboardingProfile(database, customer.tenantId),
      listStoreConnections(database, customer.tenantId),
      getSalesSummary(database, scope),
      listTenantTickets(database, customer.tenantId, { status: "open" }, { page: 1, pageSize: 1 }),
      getWeeklyOrderCounts(database, customer.tenantId, ACTIVITY_WEEKS),
    ]);
    return {
      customer,
      health,
      access,
      events,
      weeklyOrders,
      profile: holderStatus(profile),
      stores: await withSuppliers(stores),
      summary,
      openTickets: tickets.total,
    };
  });

/** Tells the old address that the team moved the account, so a change nobody asked is noticed. */
async function notifyPreviousAddress(input: { previousEmail: string; maskedEmail: string }) {
  const email = renderActionEmail(
    {
      subject: "O e-mail da sua conta no SellBridge mudou",
      preview: `A equipe do SellBridge trocou o e-mail da sua conta para ${input.maskedEmail}.`,
      heading: "O e-mail da sua conta mudou",
      paragraphs: [
        `A equipe do SellBridge trocou o e-mail da sua conta para ${input.maskedEmail}.`,
        "O novo endereço precisa ser confirmado pelo link que enviamos para ele.",
      ],
      actionLabel: "Falar com o suporte",
      actionUrl: new URL("/suporte/novo", environment.APP_URL).toString(),
      footnote: "Se você não pediu essa troca, fale com o suporte agora.",
    },
    environment.APP_URL,
  );
  await sendEmail({ to: input.previousEmail, ...email });
}

/** Better Auth, the mailer and the trail behind `saveCustomerProfile`, for one customer. */
function profileSaveSteps(adminId: string, userId: string): ProfileSaveSteps {
  const headers = getRequestHeaders();
  return {
    updateUser: async (data) => {
      await auth.api.adminUpdateUser({ body: { userId, data }, headers });
    },
    sendVerification: async (email) => {
      await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/login" } });
    },
    notifyPreviousAddress,
    record: async (action) => recordAdminAction(adminId, userId, action),
  };
}

export const adminUpdateCustomerProfile = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(updateCustomerProfileSchema)
  .handler(async ({ context, data }) => {
    const customer = await requireManageableCustomer(context.actor, data.userId);
    const email = data.email.toLowerCase();
    if (await isEmailTakenByOther(database, email, data.userId)) {
      throw conflictError("Já existe outra conta com este e-mail");
    }
    const { emailChanged } = await saveCustomerProfile(
      { name: data.name, previousEmail: customer.email, email },
      profileSaveSteps(context.userId, data.userId),
    );
    return { ok: true, emailChanged };
  });

export const adminSetCustomerRole = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(setCustomerRoleSchema)
  .handler(async ({ context, data }) => {
    assertNotSelf(context.userId, data.userId, "alterar o papel de");
    const customer = await requireManageableCustomer(context.actor, data.userId);
    // ADMIN_EMAILS addresses are promoted back on every update (auth.ts), wiping the password
    // and sessions on the way; the role of those accounts is set in the environment instead.
    if (data.role !== "admin" && isAdminEmail(customer.email)) {
      throw conflictError("Este e-mail é de um dono da plataforma e é sempre administrador.");
    }
    await auth.api.setRole({
      body: { userId: data.userId, role: data.role },
      headers: getRequestHeaders(),
    });
    await recordAdminAction(context.userId, data.userId, "role_changed", { role: data.role });
    return { ok: true };
  });

/**
 * A blocked account stops being served everywhere, not only in the app: its API keys keep
 * working and its webhooks keep receiving data otherwise. Unblocking does not turn them back on:
 * the owner creates new keys and re-enables the endpoints they still want.
 */
async function shutOffIntegrations(tenantId: string): Promise<void> {
  const [keys, endpoints] = await Promise.all([
    revokeTenantApiKeys(database, tenantId),
    disableTenantWebhookEndpoints(database, tenantId),
  ]);
  logger.info("admin.integrations_shut_off", { tenantId, keys, endpoints });
}

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
    const customer = await requireManageableCustomer(context.actor, data.userId);
    await applyBan(data);
    if (data.banned && customer.tenantId) {
      await shutOffIntegrations(customer.tenantId);
    }
    await recordAdminAction(context.userId, data.userId, "ban_changed", { banned: data.banned });
    return { ok: true };
  });

export const adminRevokeCustomerSessions = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(customerIdSchema)
  .handler(async ({ context, data }) => {
    await requireManageableCustomer(context.actor, data.userId);
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
    const customer = await requireManageableCustomer(context.actor, data.userId);
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

/** Each shop of the customer, with the one supplier it sells (null while pending). */
async function withSuppliers(stores: readonly StoreConnectionSummary[]) {
  const suppliers = await findStoreSuppliers(
    database,
    stores.flatMap((store) => (store.supplierId === null ? [] : [store.supplierId])),
  );
  const byId = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  return stores.map((store) => ({
    id: store.id,
    shopName: store.shopName,
    marketplace: store.marketplace,
    marketplaceLabel: MARKETPLACE_LABELS[store.marketplace],
    status: store.status,
    supplier: store.supplierId === null ? null : (byId.get(store.supplierId) ?? null),
  }));
}

/** What moving a customer's shop to another supplier would pause or stop, without saving. */
export const adminPreviewStoreSupplier = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(adminStoreSupplierSchema)
  .handler(async ({ data }) => {
    const tenantId = await requireCustomerTenant(data.userId);
    return previewStoreSupplierChange(database, {
      tenantId,
      storeConnectionId: data.storeConnectionId,
      supplierId: data.supplierId,
    });
  });

/** Moves a customer's shop to another supplier, as the customer would on the stores page. */
export const adminChangeStoreSupplier = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(adminStoreSupplierSchema)
  .handler(async ({ context, data }) => {
    const tenantId = await requireCustomerTenant(data.userId);
    const impact = await changeStoreSupplier(database, {
      tenantId,
      storeConnectionId: data.storeConnectionId,
      supplierId: data.supplierId,
    });
    const [supplier] = await findStoreSuppliers(database, [data.supplierId]);
    await recordAdminAction(context.userId, data.userId, "store_supplier_changed", {
      storeConnectionId: data.storeConnectionId,
      supplierName: supplier?.name ?? "",
      livePaused: impact.livePaused,
    });
    if (impact.livePaused > 0) {
      await requestStockSync("admin.store_supplier_sync_deferred");
    }
    return impact;
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
