import { randomUUID } from "node:crypto";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { eq, inArray } from "drizzle-orm";
import { createDatabase, type Database } from "../client.ts";
import { organization, supplierProducts, suppliers, user } from "../schema/index.ts";

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

/** Creates two tenants (A and B) to check isolation between them. */
export async function createTestTenantPair(database: Database) {
  const tenants = await createTestTenants(database, 2);
  const [tenantA, tenantB] = tenants.ids;
  if (!tenantA || !tenantB) {
    throw new Error("tenants não criados");
  }
  return { tenantA, tenantB, cleanup: tenants.cleanup };
}

/** Creates throwaway users with unique emails and returns a cleanup function. */
export async function createTestUsers(database: Database, amount: number) {
  const ids = Array.from({ length: amount }, () => randomUUID());
  await database.insert(user).values(
    ids.map((id, index) => ({
      id,
      name: `Usuário ${index}`,
      email: `test-${id}@sellbridge.test`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
  async function cleanup(): Promise<void> {
    await database.delete(user).where(inArray(user.id, ids));
  }
  return { ids, cleanup };
}

interface TestProductInput {
  sku: string;
  title: string;
  costCents: number;
  suggestedPriceCents: number;
  stock?: number;
}

/** Creates a throwaway supplier with one product; cleanup removes both. */
export async function createTestSupplierProduct(database: Database, product: TestProductInput) {
  const [supplier] = await database
    .insert(suppliers)
    .values({ name: `Fornecedor de teste ${product.sku}`, niche: "Teste", state: "ZZ", city: "X" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor não criado");
  }
  const [created] = await database
    .insert(supplierProducts)
    .values({ supplierId: supplier.id, ...product })
    .returning();
  if (!created) {
    throw new Error("produto não criado");
  }
  const supplierId = supplier.id;
  async function cleanup(): Promise<void> {
    await database.delete(suppliers).where(eq(suppliers.id, supplierId));
  }
  return { supplierId, productId: created.id, cleanup };
}

/** Input for `upsertStoreConnection` with a mock marketplace shop. */
export function testStoreInput(tenantId: string, shopId: string) {
  return {
    tenantId,
    marketplace: "mock" as const,
    externalShopId: shopId,
    shopName: `Loja ${shopId}`,
    accessTokenEnc: "enc-access",
    refreshTokenEnc: "enc-refresh",
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}
