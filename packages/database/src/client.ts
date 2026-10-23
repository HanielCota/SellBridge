import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof createDatabase>;

interface DatabaseOptions {
  maxConnections?: number;
  /** Names the connections in `pg_stat_activity`, so a caller's share of the pool shows there. */
  applicationName?: string;
}

export function createDatabase(databaseUrl: string, options: DatabaseOptions = {}) {
  const connection =
    options.applicationName === undefined ? {} : { application_name: options.applicationName };
  const client = postgres(databaseUrl, { max: options.maxConnections ?? 10, connection });
  return drizzle({ client, schema, casing: "snake_case" });
}

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The database or an open transaction: for writes that must join the caller's transaction. */
export type DatabaseExecutor = Database | Transaction;
