import { notFoundError } from "@sellbridge/shared/errors";
import { type Pagination, type Paginated, toPaginated } from "@sellbridge/shared/schemas";
import { and, asc, count, eq } from "drizzle-orm";
import type { Database } from "../client.ts";
import { billingAccounts, orders, organization, suppliers } from "../schema/index.ts";

/** One organization as the developer API reads it: no provider ids, no metadata. */
export interface DeveloperOrganization {
  id: string;
  name: string;
  slug: string;
  kind: "seller" | "supplier";
  createdAt: Date;
  plan: string | null;
  billingStatus: string | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
}

const organizationColumns = {
  id: organization.id,
  name: organization.name,
  slug: organization.slug,
  kind: organization.kind,
  createdAt: organization.createdAt,
  plan: billingAccounts.plan,
  billingStatus: billingAccounts.status,
  periodEnd: billingAccounts.periodEnd,
  cancelAtPeriodEnd: billingAccounts.cancelAtPeriodEnd,
};

/** Every organization, oldest first; an organization that never billed has null plan fields. */
export async function listOrganizationsForDeveloper(
  database: Database,
  pagination: Pagination,
): Promise<Paginated<DeveloperOrganization>> {
  const [total] = await database.select({ value: count() }).from(organization);
  const items = await database
    .select(organizationColumns)
    .from(organization)
    .leftJoin(billingAccounts, eq(billingAccounts.tenantId, organization.id))
    .orderBy(asc(organization.createdAt), asc(organization.id))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  return toPaginated(items, total?.value ?? 0, pagination);
}

/** @throws notFound when no organization has this id. */
export async function getOrganizationForDeveloper(
  database: Database,
  organizationId: string,
): Promise<DeveloperOrganization> {
  const [row] = await database
    .select(organizationColumns)
    .from(organization)
    .leftJoin(billingAccounts, eq(billingAccounts.tenantId, organization.id))
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (row === undefined) {
    throw notFoundError("Organização não encontrada");
  }
  return row;
}

/**
 * The sealed shipping address of one order of the organization, or null when the marketplace
 * sent none. Opening it is the caller's job, and only for keys allowed to see it.
 *
 * @throws notFound when the order is not the organization's.
 */
export async function findSealedShippingAddress(
  database: Database,
  tenantId: string,
  orderId: string,
): Promise<string | null> {
  const [row] = await database
    .select({ sealed: orders.shippingAddressEnc })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
    .limit(1);
  if (row === undefined) {
    throw notFoundError("Pedido não encontrado");
  }
  return row.sealed;
}

export type DeveloperSupplier = typeof suppliers.$inferSelect;

/**
 * Every supplier, the private catalogs sellers keep for themselves included (unlike the admin
 * list): developers read everything, and the caller marks which ones are private.
 */
export async function listSuppliersForDeveloper(
  database: Database,
  pagination: Pagination,
): Promise<Paginated<DeveloperSupplier>> {
  const [total] = await database.select({ value: count() }).from(suppliers);
  const items = await database
    .select()
    .from(suppliers)
    .orderBy(asc(suppliers.name), asc(suppliers.id))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize);
  return toPaginated(items, total?.value ?? 0, pagination);
}
