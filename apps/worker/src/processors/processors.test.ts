import { randomBytes, randomUUID } from "node:crypto";
import { createDatabase, schema } from "@sellbridge/database";
import { createListingWithTargets } from "@sellbridge/database/repositories";
import {
  createConnectorRegistry,
  createTokenCipher,
  encodeMockAuthorizationCode,
  MOCK_REVOKED_REFRESH_TOKEN,
} from "@sellbridge/marketplaces";
import { loadRootEnvironmentFile } from "@sellbridge/shared/environment-file";
import { UnrecoverableError } from "bullmq";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublishListingProcessor } from "./publish-listing.ts";
import { createTokenRefreshProcessor } from "./token-refresh.ts";

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
const processPublish = createPublishListingProcessor({
  database,
  connectors,
  cipher,
  acquireRateLimit: async () => {},
});

const tenantIds = [randomUUID(), randomUUID()];
let supplierId = "";
let productId = "";
let connectedStoreId = "";
let disconnectedStoreId = "";

async function createStore(tenantId: string, status: "connected" | "disconnected") {
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

async function createTarget(title: string, storeId = connectedStoreId) {
  const [tenantId] = tenantIds;
  if (!tenantId) {
    throw new Error("tenant ausente");
  }
  const created = await createListingWithTargets(
    database,
    tenantId,
    {
      supplierProductId: productId,
      title,
      description: "Descrição do produto de teste",
      priceCents: 4990,
    },
    [storeId],
  );
  const [targetId] = created.targetIds;
  if (!targetId) {
    throw new Error("destino não criado");
  }
  return { tenantId, targetId };
}

async function targetRow(targetId: string) {
  const row = await database.query.listingTargets.findFirst({
    where: eq(schema.listingTargets.id, targetId),
  });
  if (!row) {
    throw new Error("destino não encontrado");
  }
  return row;
}

beforeAll(async () => {
  await database.insert(schema.organization).values(
    tenantIds.map((id) => ({
      id,
      name: "Tenant worker",
      slug: `worker-${id}`,
      createdAt: new Date(),
    })),
  );
  const [supplier] = await database
    .insert(schema.suppliers)
    .values({ name: "Fornecedor worker", niche: "Teste", state: "ZZ", city: "Teste" })
    .returning();
  if (!supplier) {
    throw new Error("fornecedor não criado");
  }
  supplierId = supplier.id;
  const [product] = await database
    .insert(schema.supplierProducts)
    .values({
      supplierId,
      sku: "W-1",
      title: "Produto worker",
      costCents: 2000,
      suggestedPriceCents: 4990,
      stock: 7,
    })
    .returning();
  if (!product) {
    throw new Error("produto não criado");
  }
  productId = product.id;
  const [tenantId] = tenantIds;
  if (!tenantId) {
    throw new Error("tenant ausente");
  }
  connectedStoreId = (await createStore(tenantId, "connected")).id;
  disconnectedStoreId = (await createStore(tenantId, "disconnected")).id;
});

afterAll(async () => {
  await database.delete(schema.organization).where(inArray(schema.organization.id, tenantIds));
  await database.delete(schema.suppliers).where(eq(schema.suppliers.id, supplierId));
  await database.$client.end();
});

describe("publish-listing processor", () => {
  it("publishes and is idempotent on re-run", async () => {
    const { tenantId, targetId } = await createTarget("Camiseta básica de algodão");
    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    expect(await processPublish(job)).toBe("published");
    const first = await targetRow(targetId);
    expect(first).toMatchObject({ status: "published", attempts: 1, errorReason: null });
    expect(first.externalId).toMatch(/^MOCK-ITEM-/);

    expect(await processPublish(job)).toBe("already_published");
    expect((await targetRow(targetId)).attempts).toBe(1);
  });

  it("marks permanent rejections as error without retrying", async () => {
    const { tenantId, targetId } = await createTarget("Produto proibido [falha]");
    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    await expect(processPublish(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(await targetRow(targetId)).toMatchObject({
      status: "error",
      errorReason: "Anúncio recusado: o título contém termos não permitidos",
    });
  });

  it("keeps temporary failures pending until the last attempt", async () => {
    const { tenantId, targetId } = await createTarget("Produto com marketplace [instavel]");
    const data = { tenantId, listingTargetId: targetId };

    const firstAttempt = processPublish({ data, attemptsMade: 0, maxAttempts: 3 });
    await expect(firstAttempt).rejects.not.toBeInstanceOf(UnrecoverableError);
    expect(await targetRow(targetId)).toMatchObject({
      status: "pending",
      errorReason: "Marketplace indisponível no momento",
    });

    await expect(processPublish({ data, attemptsMade: 2, maxAttempts: 3 })).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(await targetRow(targetId)).toMatchObject({ status: "error", attempts: 2 });
  });

  it("fails when the destination store is disconnected", async () => {
    const { tenantId, targetId } = await createTarget(
      "Produto para loja desconectada",
      disconnectedStoreId,
    );
    await expect(
      processPublish({
        data: { tenantId, listingTargetId: targetId },
        attemptsMade: 0,
        maxAttempts: 5,
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect((await targetRow(targetId)).errorReason).toContain("desconectada");
  });

  it("does not process a publication of another tenant", async () => {
    const { targetId } = await createTarget("Produto de outro tenant aqui");
    const [, otherTenant] = tenantIds;
    await expect(
      processPublish({
        data: { tenantId: otherTenant, listingTargetId: targetId },
        attemptsMade: 0,
        maxAttempts: 5,
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect((await targetRow(targetId)).status).toBe("pending");
  });

  it("rejects malformed payloads", async () => {
    await expect(
      processPublish({ data: { listingTargetId: "x" }, attemptsMade: 0, maxAttempts: 1 }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});

describe("token-refresh processor", () => {
  it("refreshes expiring tokens and expires revoked ones", async () => {
    const [tenantId] = tenantIds;
    if (!tenantId) {
      throw new Error("tenant ausente");
    }
    const soon = new Date(Date.now() + 60_000);
    const healthy = await createStore(tenantId, "connected");
    await database
      .update(schema.storeConnections)
      .set({ expiresAt: soon })
      .where(eq(schema.storeConnections.id, healthy.id));
    const revoked = await createStore(tenantId, "connected");
    await database
      .update(schema.storeConnections)
      .set({ expiresAt: soon, refreshTokenEnc: cipher.encrypt(MOCK_REVOKED_REFRESH_TOKEN) })
      .where(eq(schema.storeConnections.id, revoked.id));

    const summary = await createTokenRefreshProcessor({ database, connectors, cipher })();
    expect(summary.refreshed).toBeGreaterThanOrEqual(1);
    expect(summary.expired).toBeGreaterThanOrEqual(1);

    const refreshedRow = await database.query.storeConnections.findFirst({
      where: eq(schema.storeConnections.id, healthy.id),
    });
    expect(refreshedRow?.status).toBe("connected");
    expect(refreshedRow?.expiresAt?.getTime()).toBeGreaterThan(soon.getTime());

    const revokedRow = await database.query.storeConnections.findFirst({
      where: eq(schema.storeConnections.id, revoked.id),
    });
    expect(revokedRow?.status).toBe("expired");
  });
});
