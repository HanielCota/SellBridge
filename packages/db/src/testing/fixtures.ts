import { randomUUID } from "node:crypto";
import { loadRootEnv } from "@sellbridge/shared/env-node";
import { inArray } from "drizzle-orm";
import { createDatabase, type Database } from "../client.ts";
import { organization } from "../schema/index.ts";

export function createTestDatabase(): Database {
  loadRootEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para os testes de integração do banco");
  }
  return createDatabase(databaseUrl, { maxConnections: 2 });
}

/** Creates throwaway organizations (tenants) and returns a cleanup function. */
export async function createTestTenants(db: Database, amount: number) {
  const ids = Array.from({ length: amount }, () => randomUUID());
  await db.insert(organization).values(
    ids.map((id) => ({
      id,
      name: `Tenant de teste ${id.slice(0, 6)}`,
      slug: `test-${id}`,
      createdAt: new Date(),
    })),
  );
  async function cleanup(): Promise<void> {
    await db.delete(organization).where(inArray(organization.id, ids));
  }
  return { ids, cleanup };
}
