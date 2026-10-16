import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

/*
 * Runs the real migrations on throwaway databases (created and dropped here), so the journal's
 * ordering problems show up in `pnpm test`, not on a customer's old database.
 */
/** Migration setup and cleanup both create or drop several complete databases. */
const MIGRATION_TEST_TIMEOUT = 60_000;

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const journal = z
  .object({ entries: z.array(z.object({ idx: z.number(), tag: z.string(), when: z.number() })) })
  .parse(JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8")));

/** What 0008_public_api creates; an old database that skipped it has none of these. */
const PUBLIC_API_TABLES = [
  "api_events",
  "api_idempotency_keys",
  "api_keys",
  "api_rate_limits",
  "webhook_deliveries",
  "webhook_endpoints",
];
const PUBLIC_API_INDEXES = [
  "api_events_sequence_idx",
  "api_events_tenant_sequence_idx",
  "api_idempotency_keys_created_idx",
  "api_keys_secret_hash_idx",
  "api_keys_tenant_idx",
  "webhook_deliveries_endpoint_event_idx",
  "webhook_deliveries_due_idx",
  "webhook_deliveries_endpoint_idx",
  "webhook_endpoints_tenant_idx",
];
const PUBLIC_API_FOREIGN_KEYS = [
  "api_events_tenant_id_organization_id_fk",
  "api_idempotency_keys_tenant_id_organization_id_fk",
  "api_keys_tenant_id_organization_id_fk",
  "api_keys_created_by_user_id_user_id_fk",
  "api_rate_limits_api_key_id_api_keys_id_fk",
  "webhook_deliveries_tenant_id_organization_id_fk",
  "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk",
  "webhook_deliveries_event_id_api_events_id_fk",
  "webhook_endpoints_tenant_id_organization_id_fk",
];

let serverUrl = "";
let admin: postgres.Sql;
const created: string[] = [];

beforeAll(() => {
  loadRootEnvironmentFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para os testes de migrations");
  serverUrl = databaseUrl;
  admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
});

afterAll(async () => {
  for (const name of created) await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}, MIGRATION_TEST_TIMEOUT);

/** A new empty database on the same server, dropped after the tests. */
async function throwawayDatabase(): Promise<string> {
  const name = `sb_migrations_${randomBytes(6).toString("hex")}`;
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  created.push(name);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withClient<Result>(
  url: string,
  run: (sql: postgres.Sql) => Promise<Result>,
): Promise<Result> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

async function runMigrator(url: string): Promise<void> {
  await withClient(url, (sql) => migrate(drizzle(sql), { migrationsFolder }));
}

/**
 * Runs the migrations up to `lastIndex` statement by statement and records them the way the
 * migrator does: the database an old deployment left behind.
 */
async function applyMigrationsUpTo(url: string, lastIndex: number): Promise<void> {
  const old = journal.entries.filter((entry) => entry.idx <= lastIndex);
  await withClient(url, async (sql) => {
    for (const entry of old) {
      const file = readFileSync(`${migrationsFolder}/${entry.tag}.sql`, "utf8");
      for (const statement of file.split("--> statement-breakpoint")) {
        if (statement.trim()) await sql.unsafe(statement);
      }
    }
    await sql`create schema drizzle`;
    await sql`create table drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
    for (const entry of old) {
      const file = readFileSync(`${migrationsFolder}/${entry.tag}.sql`, "utf8");
      const hash = createHash("sha256").update(file).digest("hex");
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${entry.when})`;
    }
  });
}

async function publicApiObjects(url: string) {
  return withClient(url, async (sql) => ({
    tables: (
      await sql<{ name: string }[]>`
        select table_name as name from information_schema.tables
        where table_schema = 'public' and table_name in ${sql(PUBLIC_API_TABLES)}`
    )
      .map((row) => row.name)
      .toSorted(),
    indexes: (
      await sql<{ name: string }[]>`
        select indexname as name from pg_indexes
        where schemaname = 'public' and indexname in ${sql(PUBLIC_API_INDEXES)}`
    )
      .map((row) => row.name)
      .toSorted(),
    foreignKeys: (
      await sql<{ name: string }[]>`
        select conname as name from pg_constraint
        where contype = 'f' and conname in ${sql(PUBLIC_API_FOREIGN_KEYS)}`
    )
      .map((row) => row.name)
      .toSorted(),
  }));
}

/** Every column of the public API tables, as the database describes it. */
async function publicApiColumns(url: string) {
  return withClient(
    url,
    (sql) => sql`
      select table_name, column_name, data_type, column_default, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name in ${sql(PUBLIC_API_TABLES)}
      order by table_name, column_name`,
  );
}

const expectedObjects = {
  tables: PUBLIC_API_TABLES.toSorted(),
  indexes: PUBLIC_API_INDEXES.toSorted(),
  foreignKeys: PUBLIC_API_FOREIGN_KEYS.toSorted(),
};

describe("migrations", { timeout: MIGRATION_TEST_TIMEOUT }, () => {
  it("M1: a new database takes every migration, and a second run changes nothing", async () => {
    const url = await throwawayDatabase();
    await runMigrator(url);
    await runMigrator(url);
    expect(await publicApiObjects(url)).toEqual(expectedObjects);
    const applied = await withClient(
      url,
      (sql) => sql<{ count: string }[]>`select count(*) from drizzle.__drizzle_migrations`,
    );
    expect(Number(applied[0]?.count)).toBe(journal.entries.length);
  });

  it("M2: a database that recorded 0007 before 0008 existed still gets the public API", async () => {
    const url = await throwawayDatabase();
    await applyMigrationsUpTo(url, 7);
    // The state the bug leaves behind: 0007 is the newest record, so 0008 looks already applied.
    expect((await publicApiObjects(url)).tables).toEqual([]);

    await runMigrator(url);
    expect(await publicApiObjects(url)).toEqual(expectedObjects);
    // Hand-written repair: the columns must match a database that ran 0008 itself.
    const fresh = await throwawayDatabase();
    await runMigrator(fresh);
    expect([...(await publicApiColumns(url))]).toEqual([...(await publicApiColumns(fresh))]);
    // And the migrations after 0008 ran too (0020 adds this column).
    const column = await withClient(
      url,
      (sql) => sql`
        select 1 from information_schema.columns
        where table_name = 'order_adjustments' and column_name = 'marketplace_key'`,
    );
    expect(column).toHaveLength(1);
  });

  it("M2: 0023 keeps one live connection per shop when two tenants had the same one", async () => {
    const url = await throwawayDatabase();
    await applyMigrationsUpTo(url, 22);
    await withClient(url, async (sql) => {
      await sql`
        insert into organization (id, name, slug, created_at) values
          ('org-old', 'Antiga', 'antiga', now()), ('org-new', 'Nova', 'nova', now())`;
      await sql`
        insert into store_connections (id, tenant_id, marketplace, external_shop_id, shop_name, status, connected_at, access_token_enc) values
          ('00000000-0000-4000-8000-000000000001', 'org-old', 'mercado_livre', 'shop-1', 'Loja', 'connected', '2026-01-01T00:00:00Z', 'cipher'),
          ('00000000-0000-4000-8000-000000000002', 'org-new', 'mercado_livre', 'shop-1', 'Loja', 'expired', '2026-02-01T00:00:00Z', null),
          ('00000000-0000-4000-8000-000000000003', 'org-old', 'mercado_livre', 'shop-2', 'Outra', 'connected', '2026-01-01T00:00:00Z', 'cipher')`;
    });

    await runMigrator(url);

    const rows = await withClient(
      url,
      (sql) =>
        sql<
          {
            id: string;
            status: string;
            last_error: string | null;
            access_token_enc: string | null;
          }[]
        >`select id, status, last_error, access_token_enc from store_connections order by id`,
    );
    expect(rows.map((row) => [row.id.slice(-1), row.status])).toEqual([
      ["1", "disconnected"],
      ["2", "expired"],
      ["3", "connected"],
    ]);
    expect(rows[0]?.last_error).toContain("outra conta");
    expect(rows[0]?.access_token_enc).toBeNull();
    expect(rows[1]?.last_error).toBeNull();
    expect(rows[2]?.access_token_enc).toBe("cipher");
  });
  it("M1: the region leftovers of the CPF change are gone and the holder stays", async () => {
    const url = await throwawayDatabase();
    await runMigrator(url);
    const leftovers = await withClient(
      url,
      (sql) => sql<{ name: string }[]>`
        select table_name as name from information_schema.tables
        where table_schema = 'public' and table_name in ('supplier_coverage', 'cep_cache')
        union all
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'tenant_profile'
          and column_name in ('cep', 'state', 'city', 'neighborhood', 'street', 'number', 'complement')`,
    );
    expect(leftovers.map((row) => row.name)).toEqual([]);
    const holder = await withClient(
      url,
      (sql) => sql<{ name: string }[]>`
        select column_name as name from information_schema.columns
        where table_schema = 'public' and table_name = 'tenant_profile'
          and column_name in ('full_name', 'cpf', 'starter_supplier_id')
        order by column_name`,
    );
    expect(holder.map((row) => row.name)).toEqual(["cpf", "full_name", "starter_supplier_id"]);
  });
});
