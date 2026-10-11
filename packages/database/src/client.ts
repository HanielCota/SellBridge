import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(databaseUrl: string, options: { maxConnections?: number } = {}) {
  const client = postgres(databaseUrl, { max: options.maxConnections ?? 10 });
  return drizzle({ client, schema, casing: "snake_case" });
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The database or an open transaction: for writes that must join the caller's transaction. */
export type DatabaseExecutor = Database | Transaction;
