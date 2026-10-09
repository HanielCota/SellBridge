import { type Pagination, type Paginated, toPaginated } from "@sellbridge/shared/schemas";
import { and, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client.ts";
import { member, tenantProfile, user } from "../schema/index.ts";
import { containsPattern } from "./search-pattern.ts";

/** How far back the "recent activity" numbers look. */
export const CUSTOMER_ACTIVITY_DAYS = 30;

export interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  createdAt: Date;
  tenantId: string | null;
  city: string | null;
  state: string | null;
  connectedStores: number;
  publishedListings: number;
  failedListings: number;
  recentOrders: number;
  recentRevenueCents: number;
}

function activitySince(now: Date): Date {
  return new Date(now.getTime() - CUSTOMER_ACTIVITY_DAYS * 86_400_000);
}

/** Per-tenant counters computed in the same query, so the list needs a single round trip. */
function customerColumns(since: Date) {
  const tenantId = member.organizationId;
  const countedOrders = sql`o.tenant_id = ${tenantId} and o.ordered_at >= ${since.toISOString()}::timestamptz and o.status not in ('cancelled', 'returned')`;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: sql<string>`coalesce(${user.role}, 'user')`,
    banned: sql<boolean>`coalesce(${user.banned}, false)`,
    banReason: user.banReason,
    createdAt: user.createdAt,
    tenantId,
    city: tenantProfile.city,
    state: tenantProfile.state,
    connectedStores:
      sql`(select count(*) from store_connections s where s.tenant_id = ${tenantId} and s.status <> 'disconnected')`.mapWith(
        Number,
      ),
    publishedListings:
      sql`(select count(*) from listing_targets t where t.tenant_id = ${tenantId} and t.status = 'published')`.mapWith(
        Number,
      ),
    failedListings:
      sql`(select count(*) from listing_targets t where t.tenant_id = ${tenantId} and t.status = 'error')`.mapWith(
        Number,
      ),
    recentOrders: sql`(select count(*) from orders o where ${countedOrders})`.mapWith(Number),
    recentRevenueCents:
      sql`(select coalesce(sum(o.total_cents), 0) from orders o where ${countedOrders})`.mapWith(
        Number,
      ),
  };
}

function customerSearch(search: string | undefined): SQL | undefined {
  if (!search) {
    return undefined;
  }
  const pattern = containsPattern(search);
  return or(ilike(user.name, pattern), ilike(user.email, pattern));
}

function customersQuery(database: Database, now: Date) {
  return database
    .select(customerColumns(activitySince(now)))
    .from(user)
    .leftJoin(member, and(eq(member.userId, user.id), eq(member.role, "owner")))
    .leftJoin(tenantProfile, eq(tenantProfile.tenantId, member.organizationId));
}

export async function listCustomers(
  database: Database,
  filters: { search?: string | undefined },
  pagination: Pagination,
  now: Date = new Date(),
): Promise<Paginated<CustomerSummary>> {
  const where = customerSearch(filters.search);
  const [rows, totals] = await Promise.all([
    customersQuery(database, now)
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize),
    database.select({ total: count() }).from(user).where(where),
  ]);
  return toPaginated(rows, totals.at(0)?.total ?? 0, pagination);
}

export async function getCustomer(
  database: Database,
  userId: string,
  now: Date = new Date(),
): Promise<CustomerSummary | null> {
  const [row] = await customersQuery(database, now).where(eq(user.id, userId)).limit(1);
  return row ?? null;
}
