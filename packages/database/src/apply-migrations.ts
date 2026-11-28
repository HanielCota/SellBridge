import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client.ts";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/**
 * Applies the pending migrations while holding a session advisory lock. The web and the worker
 * both migrate on start (whichever comes up first), so the lock makes the second one wait and then
 * find nothing left to apply instead of racing the first.
 */
export async function applyMigrations(databaseUrl: string): Promise<void> {
  // One connection, so the session lock, the migrations and the unlock share it.
  const database = createDatabase(databaseUrl, { maxConnections: 1 });
  try {
    await database.execute(sql`select pg_advisory_lock(hashtext('sellbridge-migrations'))`);
    await migrate(database, { migrationsFolder });
    await database.execute(sql`select pg_advisory_unlock(hashtext('sellbridge-migrations'))`);
  } finally {
    await database.$client.end();
  }
}
