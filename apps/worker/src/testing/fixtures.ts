import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase, type Database, schema } from "@sellbridge/database";
import { createListingWithTargets, markTargetPublished } from "@sellbridge/database/repositories";
import { createConnectorRegistry, encodeMockAuthorizationCode } from "@sellbridge/marketplaces";
import { createTokenCipher } from "@sellbridge/shared/token-cipher";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { eq, inArray } from "drizzle-orm";

/** Database, mock connectors and a throwaway cipher for processor integration tests. */
export function createWorkerTestEnvironment() {
  loadRootEnvironmentFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL é obrigatória para os testes do worker");
  }
  const database = createDatabase(databaseUrl, { maxConnections: 2 });
  const cipher = createTokenCipher(randomBytes(32).toString("base64"));
  const connectors = createConnectorRegistry({
    appUrl: "http://localhost:3000",
    mockWebhookSecret: "segredo-de-teste-123",
    mockLatencyMilliseconds: 0,
  });
  return { database, cipher, connectors };
}

export type WorkerTestEnvironment = ReturnType<typeof createWorkerTestEnvironment>;

/** Creates throwaway organizations (tenants) with unique ids and returns a cleanup function. */
export async function createTestTenants(database: Database, amount: number) {
  const ids = Array.from({ length: amount }, () => randomUUID());
  await database.insert(schema.organization).values(
    ids.map((id) => ({
      id,
      name: "Tenant worker",
      slug: `worker-${id}`,
      createdAt: new Date(),
    })),
  );
  const [first] = ids;
  if (!first) {
    throw new Error("tenant ausente");
  }
  async function cleanup(): Promise<void> {
    await database.delete(schema.organization).where(inArray(schema.organization.id, ids));
  }
  return { ids, first, cleanup };
}

interface TestProductInput {
  sku: string;
  title: string;
  stock: number;
}

/** Creates a throwaway supplier with one product (cost 20,00, price 49,90). */
export async function createTestProduct(database: Database, product: TestProductInput) {
  const [supplier] = await database
    .insert(schema.suppliers)
    .values({ name: `Fornecedor ${product.sku}`, niche: "Teste", state: "ZZ", city: "Teste" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor não criado");
  }
  const [created] = await database
    .insert(schema.supplierProducts)
    .values({ supplierId: supplier.id, costCents: 2000, suggestedPriceCents: 4990, ...product })
    .returning();
  if (!created) {
    throw new Error("produto não criado");
  }
  const supplierId = supplier.id;
  async function cleanup(): Promise<void> {
    await database.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
  }
  return { supplierId, productId: created.id, cleanup };
}

/** Connects a mock marketplace shop to the tenant with real (encrypted) mock tokens. */
export async function createTestStore(
  { database, connectors, cipher }: WorkerTestEnvironment,
  tenantId: string,
  status: "connected" | "disconnected" = "connected",
) {
  const { tokens, shop } = await connectors.mock.exchangeCode({
    code: encodeMockAuthorizationCode(`Loja ${status}`),
    redirectUri: "http://localhost:3000/cb",
  });
  const [store] = await database
    .insert(schema.storeConnections)
    .values({
      tenantId,
      marketplace: "mock",
      externalShopId: shop.externalShopId,
      shopName: shop.shopName,
      accessTokenEnc: status === "connected" ? cipher.encrypt(tokens.accessToken) : null,
      refreshTokenEnc: tokens.refreshToken ? cipher.encrypt(tokens.refreshToken) : null,
      expiresAt: tokens.expiresAt,
      status,
    })
    .returning();
  if (!store) {
    throw new Error("falha ao criar loja de teste");
  }
  return store;
}

interface TestTargetInput {
  tenantId: string;
  productId: string;
  storeId: string;
  title: string;
}

/** Creates a listing with a single pending target on the given store. */
export async function createTestTarget(database: Database, input: TestTargetInput) {
  const created = await createListingWithTargets(
    database,
    input.tenantId,
    {
      supplierProductId: input.productId,
      title: input.title,
      description: "Descrição do produto de teste",
      priceCents: 4990,
    },
    [input.storeId],
  );
  const [targetId] = created.targetIds;
  if (!targetId) {
    throw new Error("destino não criado");
  }
  return targetId;
}

/** Creates a target already published on the marketplace under `externalId`. */
export async function createPublishedTestTarget(
  database: Database,
  input: TestTargetInput & { externalId: string },
) {
  const targetId = await createTestTarget(database, input);
  await markTargetPublished(database, targetId, {
    externalId: input.externalId,
    externalUrl: null,
  });
  return targetId;
}
