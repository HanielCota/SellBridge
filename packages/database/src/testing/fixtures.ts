import { randomUUID } from "node:crypto";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { inArray } from "drizzle-orm";
import { createDatabase, type Database } from "../client.ts";
import { organization } from "../schema/index.ts";

export function createTestDatabase(): Database {
  loadRootEnvironmentFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para os testes de integração do banco");
  }
  return createDatabase(databaseUrl, { maxConnections: 2 });
}

/** Creates throwaway organizations (tenants) and returns a cleanup function. */
export async function createTestTenants(database: Database, amount: number) {
  const ids = Array.from({ length: amount }, () => randomUUID());
  await database.insert(organization).values(
    ids.map((id) => ({
      id,
      name: `Tenant de teste ${id.slice(0, 6)}`,
      slug: `test-${id}`,
      createdAt: new Date(),
    })),
  );
  async function cleanup(): Promise<void> {
    await database.delete(organization).where(inArray(organization.id, ids));
  }
  return { ids, cleanup };
}
