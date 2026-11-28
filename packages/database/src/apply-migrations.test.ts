import { randomBytes } from "node:crypto";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "./apply-migrations.ts";

/** Two full migration runs on a new database. */
const MIGRATION_TEST_TIMEOUT = 60_000;

let serverUrl = "";
let admin: postgres.Sql;
const created: string[] = [];

beforeAll(() => {
  loadRootEnvironmentFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
    throw new Error("DATABASE_URL is required for the migration tests");
  }
  serverUrl = databaseUrl;
  admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
});

afterAll(async () => {
  for (const name of created) await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}, MIGRATION_TEST_TIMEOUT);

async function throwawayDatabase(): Promise<string> {
  const name = `sb_apply_migrations_${randomBytes(6).toString("hex")}`;
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  created.push(name);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

describe("applyMigrations", () => {
  it(
    "lets the web and the worker migrate the same database at the same time",
    async () => {
      const url = await throwawayDatabase();

      const runs = await Promise.allSettled([applyMigrations(url), applyMigrations(url)]);

      expect(runs.map((run) => run.status)).toEqual(["fulfilled", "fulfilled"]);
      const sql = postgres(url, { max: 1, onnotice: () => undefined });
      try {
        const columns = await sql`
          select column_name from information_schema.columns
          where table_name = 'shipment_invoices' and column_name = 'kind'`;
        expect(columns).toHaveLength(1);
      } finally {
        await sql.end();
      }
    },
    MIGRATION_TEST_TIMEOUT,
  );
});
