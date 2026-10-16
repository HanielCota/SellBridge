import type { CustomerSignals, CustomerStoreSignal } from "@sellbridge/shared/customer-health";
import { daysBefore } from "@sellbridge/shared/time";
import { and, desc, eq, ilike, ne, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { member, tenantProfile, user } from "../schema/index.ts";
import { isCountedOrder } from "./sql/counted-orders.ts";
import { sqlIntegerSchema, timestampOf } from "./sql/raw-values.ts";
import { containsPattern } from "./sql/search-pattern.ts";

/** How far back the "recent activity" numbers look. */
const CUSTOMER_ACTIVITY_DAYS = 30;
/**
 * The health views rank every customer in memory, so one query loads them all. Past this many
 * accounts the ranking should move into SQL; until then the cap only guards the server.
 */
export const MAX_CUSTOMERS_RANKED = 5_000;
const WEEK_DAYS = 7;

const weeklyOrdersRowSchema = z.object({
  weeks_ago: sqlIntegerSchema,
  orders: sqlIntegerSchema,
});

/**
 * `previousOrders` covers the 30 days before the recent window; `lastSeenAt` comes from the
 * activity log and, for accounts older than it, their sessions.
 */
export interface CustomerSummary extends CustomerSignals {
  id: string;
  name: string;
  email: string;
  /** Whether the mailbox was proven: a platform owner needs it (see `isPlatformOwner`). */
  emailVerified: boolean;
  role: string;
  banReason: string | null;
  tenantId: string | null;
  connectedStores: number;
  recentRevenueCents: number;
  /** Stores the reseller has not disconnected, whatever their health. */
  stores: CustomerStoreSignal[];
}

function activitySince(now: Date): Date {
  return daysBefore(CUSTOMER_ACTIVITY_DAYS, now);
}

const storeSignalSchema = z.object({
  marketplace: z.string(),
  shopName: z.string(),
  status: z.string(),
  supplierName: z.string().nullable(),
});
const storeSignalsSchema = z.array(z.unknown());

/** The driver hands `json` back parsed or as text depending on the column type it sees. */
function parseStores(value: unknown): CustomerStoreSignal[] {
  const parsed = storeSignalsSchema.safeParse(
    typeof value === "string" ? JSON.parse(value) : value,
  );
  if (!parsed.success) {
    return [];
  }
  return parsed.data.flatMap((entry) => {
    const store = storeSignalSchema.safeParse(entry);
    return store.success ? [store.data] : [];
  });
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    return new Date(value);
  }
  return null;
}

function countedOrdersBetween(tenantId: SQLWrapper, from: Date, to: Date): SQL {
  return sql`o.tenant_id = ${tenantId} and o.ordered_at >= ${timestampOf(from)} and o.ordered_at < ${timestampOf(to)} and ${isCountedOrder(sql.raw("o.status"))}`;
}

/** Per-tenant counters computed in the same query, so the list needs a single round trip. */
function customerColumns(now: Date) {
  const tenantId = member.organizationId;
  const since = activitySince(now);
  const countedOrders = countedOrdersBetween(tenantId, since, now);
  const previousOrders = countedOrdersBetween(tenantId, activitySince(since), since);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    role: sql<string>`coalesce(${user.role}, 'user')`,
    banned: sql<boolean>`coalesce(${user.banned}, false)`,
    banReason: user.banReason,
    createdAt: user.createdAt,
    tenantId,
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
    previousOrders: sql`(select count(*) from orders o where ${previousOrders})`.mapWith(Number),
    hasHolder: sql<boolean>`coalesce(${tenantProfile.cpf} is not null and ${tenantProfile.fullName} is not null, false)`,
    hasSupplier: sql<boolean>`(${tenantProfile.starterSupplierId} is not null or exists (select 1 from store_connections s where s.tenant_id = ${tenantId} and s.status <> 'disconnected' and s.supplier_id is not null))`,
    stores:
      sql`(select coalesce(json_agg(json_build_object('marketplace', s.marketplace, 'shopName', s.shop_name, 'status', s.status, 'supplierName', f.name) order by s.shop_name), '[]'::json) from store_connections s left join suppliers f on f.id = s.supplier_id where s.tenant_id = ${tenantId} and s.status <> 'disconnected')`.mapWith(
        parseStores,
      ),
    waitingTickets:
      sql`(select count(*) from tickets k where k.tenant_id = ${tenantId} and k.status = 'open')`.mapWith(
        Number,
      ),
    lastSeenAt:
      sql`coalesce((select ua.last_seen_at from user_activity ua where ua.user_id = ${user.id}), (select max(ss.updated_at) at time zone 'UTC' from session ss where ss.user_id = ${user.id} and ss.impersonated_by is null))`.mapWith(
        parseOptionalDate,
      ),
  };
}

/** Customers selling `supplierId`: through a shop, or as the supplier picked in onboarding. */
function customerSupplier(supplierId: string | undefined): SQL | undefined {
  if (supplierId === undefined) {
    return undefined;
  }
  return sql`(${tenantProfile.starterSupplierId} = ${supplierId} or exists (select 1 from store_connections s where s.tenant_id = ${member.organizationId} and s.status <> 'disconnected' and s.supplier_id = ${supplierId}))`;
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
    .select(customerColumns(now))
    .from(user)
    .leftJoin(member, and(eq(member.userId, user.id), eq(member.role, "owner")))
    .leftJoin(tenantProfile, eq(tenantProfile.tenantId, member.organizationId));
}

/**
 * Every customer matching the search, newest first, for the in-memory health ranking. Reads one
 * past `MAX_CUSTOMERS_RANKED`, so the caller can tell a cut list from one of exactly that size.
 */
export async function listCustomerSignals(
  database: Database,
  filters: { search?: string | undefined; supplierId?: string | undefined },
  now: Date = new Date(),
): Promise<CustomerSummary[]> {
  return customersQuery(database, now)
    .where(and(customerSearch(filters.search), customerSupplier(filters.supplierId)))
    .orderBy(desc(user.createdAt))
    .limit(MAX_CUSTOMERS_RANKED + 1);
}

/** Counted orders per week, oldest first, ending with the week that closes at `now`. */
export async function getWeeklyOrderCounts(
  database: Database,
  tenantId: string,
  weeks: number,
  now: Date = new Date(),
): Promise<number[]> {
  const since = daysBefore(weeks * WEEK_DAYS, now);
  const rows = await database.execute(sql`
    select floor(extract(epoch from (${timestampOf(now)} - o.ordered_at)) / ${WEEK_DAYS * 86_400})::int as weeks_ago,
      count(*)::int as orders
    from orders o
    where o.tenant_id = ${tenantId}
      and o.ordered_at >= ${timestampOf(since)}
      and o.ordered_at < ${timestampOf(now)}
      and ${isCountedOrder(sql.raw("o.status"))}
    group by 1`);
  const counts = Array.from({ length: weeks }, () => 0);
  for (const raw of rows) {
    const row = weeklyOrdersRowSchema.parse(raw);
    const index = weeks - 1 - row.weeks_ago;
    if (index >= 0 && index < weeks) {
      counts[index] = row.orders;
    }
  }
  return counts;
}

export async function getCustomer(
  database: Database,
  userId: string,
  now: Date = new Date(),
): Promise<CustomerSummary | null> {
  const [row] = await customersQuery(database, now).where(eq(user.id, userId)).limit(1);
  return row ?? null;
}

/** Whether an account other than `userId` already uses `email` (expected already lowercased). */
export async function isEmailTakenByOther(
  database: Database,
  email: string,
  userId: string,
): Promise<boolean> {
  const [taken] = await database
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), ne(user.id, userId)))
    .limit(1);
  return taken !== undefined;
}
