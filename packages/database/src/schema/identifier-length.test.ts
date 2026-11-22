import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./index.ts";

/** Postgres keeps the first 63 bytes of a name and drops the rest with only a notice. */
const POSTGRES_MAX_IDENTIFIER_BYTES = 63;

/**
 * The name as the database gets it: the client and drizzle-kit both use `casing: "snake_case"`,
 * so a camelCase key in a generated name ("storeConnectionId") reaches Postgres in snake_case.
 */
function snakeCase(name: string): string {
  return name.replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function identifiersOf(table: PgTable): string[] {
  const config = getTableConfig(table);
  const names = [
    config.name,
    ...config.columns.map((column) => column.name),
    ...config.indexes.flatMap((index) => index.config.name ?? []),
    ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
    ...config.primaryKeys.map((primaryKey) => primaryKey.getName()),
    ...config.uniqueConstraints.flatMap((unique) => unique.getName() ?? []),
    ...config.checks.map((check) => check.name),
  ];
  return names.map(snakeCase);
}

describe("schema identifiers", () => {
  it("keeps every table, column, index and constraint name within Postgres' 63 bytes", () => {
    const tables = Object.values(schema).flatMap((value) => (is(value, PgTable) ? [value] : []));

    const tooLong = tables
      .flatMap(identifiersOf)
      .filter((name) => new TextEncoder().encode(name).length > POSTGRES_MAX_IDENTIFIER_BYTES);

    expect(tables.length).toBeGreaterThan(0);
    expect(tooLong).toEqual([]);
  });
});
