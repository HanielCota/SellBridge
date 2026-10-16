import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../client.ts";
import { adminAuditEvents } from "../schema/index.ts";

/**
 * Item 28.b: the platform-wide trail of what the team did. Two sources, read as one list:
 * `admin_audit_events` (customer accounts and, with `entity_type`, the supplier catalog) and
 * `ticket_events` changed by a member of the team (support). Ticket changes made by the reseller
 * or by the system are not the team's doing and stay out.
 */
export type AuditSource = "account" | "catalog" | "support";
export type CatalogEntity = "supplier" | "product";

export interface AuditSearch {
  page: number;
  pageSize: number;
  source?: AuditSource | undefined;
  /** Who acted; tests and a "by person" filter use it. */
  actorId?: string | undefined;
  /** Matched against the action, the actor's name and what was acted on. */
  query?: string | undefined;
}

export interface AuditEntry {
  id: string;
  source: AuditSource;
  action: string;
  actorId: string | null;
  actorName: string | null;
  /** The customer's name, the supplier or product, or the ticket subject. */
  subjectLabel: string | null;
  /** Customer id, supplier/product id or ticket id, for the link to it. */
  subjectId: string | null;
  /** Catalog only: what kind of entity `subjectId` is. */
  entityType: CatalogEntity | null;
  details: Record<string, string | number | boolean | null> | null;
  createdAt: Date;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export async function recordCatalogEvent(
  database: Database,
  event: {
    adminId: string;
    entityType: CatalogEntity;
    entityId: string;
    action: string;
    details?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await database.insert(adminAuditEvents).values({
    adminId: event.adminId,
    entityType: event.entityType,
    entityId: event.entityId,
    action: event.action,
    details: event.details ?? null,
  });
}

const STAFF_ROLES_SQL = sql.raw(`('agent', 'supervisor', 'admin')`);

/**
 * Both sources in one shape. Columns are always qualified with their alias: inside the union
 * an unqualified "id" or "name" would bind to whichever table the planner saw first.
 */
const AUDIT_UNION = sql`
  select
    "event"."id"::text as "id",
    case when "event"."entity_type" is null then 'account' else 'catalog' end as "source",
    "event"."action" as "action",
    "actor"."id" as "actor_id",
    "actor"."name" as "actor_name",
    coalesce("customer"."name", "audited_supplier"."name", "audited_product"."title") as "subject_label",
    coalesce("event"."user_id", "event"."entity_id") as "subject_id",
    "event"."entity_type" as "entity_type",
    "event"."details" as "details",
    "event"."created_at" as "created_at"
  from "admin_audit_events" as "event"
  left join "user" as "actor" on "actor"."id" = "event"."admin_id"
  left join "user" as "customer" on "customer"."id" = "event"."user_id"
  left join "suppliers" as "audited_supplier"
    on "event"."entity_type" = 'supplier' and "audited_supplier"."id"::text = "event"."entity_id"
  left join "supplier_products" as "audited_product"
    on "event"."entity_type" = 'product' and "audited_product"."id"::text = "event"."entity_id"
  union all
  select
    'ticket-' || "change"."id"::text,
    'support',
    'ticket.' || "change"."type"::text,
    "staff"."id",
    "staff"."name",
    "ticket"."subject",
    "ticket"."id"::text,
    null,
    jsonb_build_object('from', "change"."from_value", 'to', "change"."to_value"),
    "change"."created_at"
  from "ticket_events" as "change"
  join "tickets" as "ticket" on "ticket"."id" = "change"."ticket_id"
  join "user" as "staff" on "staff"."id" = "change"."actor_id"
  where "change"."automatic" = false and "staff"."role" in ${STAFF_ROLES_SQL}
`;

function auditFilters(search: AuditSearch) {
  const conditions = [sql`true`];
  if (search.source !== undefined) {
    conditions.push(sql`"audit"."source" = ${search.source}`);
  }
  if (search.actorId !== undefined) {
    conditions.push(sql`"audit"."actor_id" = ${search.actorId}`);
  }
  const query = search.query?.trim();
  if (query !== undefined && query !== "") {
    const pattern = `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(
      sql`("audit"."action" ilike ${pattern} or "audit"."actor_name" ilike ${pattern} or "audit"."subject_label" ilike ${pattern})`,
    );
  }
  return sql.join(conditions, sql` and `);
}

const auditRowSchema = z.object({
  id: z.string(),
  source: z.enum(["account", "catalog", "support"]),
  action: z.string(),
  actor_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  subject_label: z.string().nullable(),
  subject_id: z.string().nullable(),
  entity_type: z.enum(["supplier", "product"]).nullable(),
  // Lenient on purpose: one old row with a nested value must not take the whole page down.
  details: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.coerce.date(),
  total: z.coerce.number(),
});

type DetailValue = string | number | boolean | null;

function isDetailValue(value: unknown): value is DetailValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

/** Keeps the flat values the screen knows how to show; nested ones are left out. */
function flatDetails(details: Record<string, unknown> | null): Record<string, DetailValue> | null {
  if (details === null) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(details).flatMap(([key, value]) =>
      isDetailValue(value) ? [[key, value] as const] : [],
    ),
  );
}

function toEntry(row: z.infer<typeof auditRowSchema>): AuditEntry {
  return {
    id: row.id,
    source: row.source,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name,
    subjectLabel: row.subject_label,
    subjectId: row.subject_id,
    entityType: row.entity_type,
    details: flatDetails(row.details),
    createdAt: row.created_at,
  };
}

export async function listAuditEntries(
  database: Database,
  search: AuditSearch,
): Promise<AuditPage> {
  const offset = (search.page - 1) * search.pageSize;
  const result = await database.execute(sql`
    select "audit".*, count(*) over () as "total"
    from (${AUDIT_UNION}) as "audit"
    where ${auditFilters(search)}
    order by "audit"."created_at" desc, "audit"."id" desc
    limit ${search.pageSize} offset ${offset}
  `);
  const rows = z.array(auditRowSchema).parse([...result]);
  // An empty page past the end still needs the total: count it alone.
  const total = rows[0]?.total ?? (offset > 0 ? await countAudit(database, search) : 0);
  return {
    items: rows.map(toEntry),
    total,
    page: search.page,
    totalPages: Math.max(1, Math.ceil(total / search.pageSize)),
  };
}

async function countAudit(database: Database, search: AuditSearch): Promise<number> {
  const result = await database.execute(sql`
    select count(*) as "total" from (${AUDIT_UNION}) as "audit" where ${auditFilters(search)}
  `);
  return z.array(z.object({ total: z.coerce.number() })).parse([...result])[0]?.total ?? 0;
}
