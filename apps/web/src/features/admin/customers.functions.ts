import {
  disconnectStore,
  findTenantRegion,
  getCustomer,
  getSalesSummary,
  listCustomers,
  listStoreConnections,
  listTenantTickets,
  saveTenantRegion,
} from "@sellbridge/database/repositories";
import { schema } from "@sellbridge/database";
import { MARKETPLACE_LABELS } from "@sellbridge/marketplaces";
import { conflictError, forbiddenError, notFoundError } from "@sellbridge/shared/errors";
import { logger } from "@sellbridge/shared/logger";
import {
  customerIdSchema,
  customersSearchSchema,
  disconnectCustomerStoreSchema,
  periodSearchSchema,
  setCustomerBanSchema,
  setCustomerRoleSchema,
  updateCustomerProfileSchema,
  updateCustomerRegionSchema,
} from "@sellbridge/shared/schemas";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { database } from "@/lib/server/database";
import { adminMiddleware } from "@/lib/server/middleware";
import { resolveCep } from "@/lib/server/region";
import { buildReportScope } from "@/lib/server/report-scope";

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

export const adminListCustomers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(customersSearchSchema)
  .handler(async ({ data }) =>
    listCustomers(database, { search: data.query }, { page: data.page, pageSize: data.pageSize }),
  );

export const adminGetCustomer = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(customerIdSchema)
  .handler(async ({ data }) => {
    const customer = await requireCustomer(data.userId);
    if (!customer.tenantId) {
      return { customer, region: null, stores: [], summary: null, openTickets: 0 };
    }
    const { scope } = buildReportScope(
      customer.tenantId,
      periodSearchSchema.parse({ period: "30d" }),
    );
    const [region, stores, summary, tickets] = await Promise.all([
      findTenantRegion(database, customer.tenantId),
      listStoreConnections(database, customer.tenantId),
      getSalesSummary(database, scope),
      listTenantTickets(database, customer.tenantId, { status: "open" }, { page: 1, pageSize: 1 }),
    ]);
    return {
      customer,
      region,
      stores: stores.map((store) => ({
        id: store.id,
        shopName: store.shopName,
        marketplaceLabel: MARKETPLACE_LABELS[store.marketplace],
        status: store.status,
      })),
      summary,
      openTickets: tickets.total,
    };
  });

export const adminUpdateCustomerProfile = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(updateCustomerProfileSchema)
  .handler(async ({ context, data }) => {
    await requireCustomer(data.userId);
    const email = data.email.toLowerCase();
    const [taken] = await database
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(and(eq(schema.user.email, email), ne(schema.user.id, data.userId)))
      .limit(1);
    if (taken) {
      throw conflictError("Já existe outra conta com este e-mail");
    }
    await auth.api.adminUpdateUser({
      body: { userId: data.userId, data: { name: data.name, email } },
      headers: getRequestHeaders(),
    });
    logger.info("admin.customer_profile_updated", { adminId: context.userId, userId: data.userId });
    return { ok: true };
  });

export const adminSetCustomerRole = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(setCustomerRoleSchema)
  .handler(async ({ context, data }) => {
    assertNotSelf(context.userId, data.userId, "alterar o papel de");
    await requireCustomer(data.userId);
    await auth.api.setRole({
      body: { userId: data.userId, role: data.role },
      headers: getRequestHeaders(),
    });
    logger.info("admin.customer_role_changed", {
      adminId: context.userId,
      userId: data.userId,
      role: data.role,
    });
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
  .inputValidator(setCustomerBanSchema)
  .handler(async ({ context, data }) => {
    assertNotSelf(context.userId, data.userId, "bloquear");
    await requireCustomer(data.userId);
    await applyBan(data);
    logger.info("admin.customer_ban_changed", {
      adminId: context.userId,
      userId: data.userId,
      banned: data.banned,
    });
    return { ok: true };
  });

export const adminRevokeCustomerSessions = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(customerIdSchema)
  .handler(async ({ context, data }) => {
    await requireCustomer(data.userId);
    await auth.api.revokeUserSessions({
      body: { userId: data.userId },
      headers: getRequestHeaders(),
    });
    logger.info("admin.customer_sessions_revoked", {
      adminId: context.userId,
      userId: data.userId,
    });
    return { ok: true };
  });

export const adminSendCustomerPasswordReset = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(customerIdSchema)
  .handler(async ({ context, data }) => {
    const customer = await requireCustomer(data.userId);
    await auth.api.requestPasswordReset({
      body: { email: customer.email, redirectTo: "/redefinir-senha" },
    });
    logger.info("admin.customer_password_reset_sent", {
      adminId: context.userId,
      userId: data.userId,
    });
    return { ok: true };
  });

export const adminUpdateCustomerRegion = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(updateCustomerRegionSchema)
  .handler(async ({ context, data }) => {
    const tenantId = await requireCustomerTenant(data.userId);
    const address = await resolveCep(data.cep);
    const region = await saveTenantRegion(database, tenantId, address);
    logger.info("admin.customer_region_updated", {
      adminId: context.userId,
      userId: data.userId,
      state: region.state,
    });
    return region;
  });

export const adminDisconnectCustomerStore = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(disconnectCustomerStoreSchema)
  .handler(async ({ context, data }) => {
    const tenantId = await requireCustomerTenant(data.userId);
    await disconnectStore(database, tenantId, data.storeConnectionId);
    logger.info("admin.customer_store_disconnected", {
      adminId: context.userId,
      userId: data.userId,
      storeConnectionId: data.storeConnectionId,
    });
    return { ok: true };
  });
