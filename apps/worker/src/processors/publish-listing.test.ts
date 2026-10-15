import { UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { schema } from "@sellbridge/database";
import { marketplaceError, type MarketplaceConnector } from "@sellbridge/marketplaces";
import { unavailableMessage } from "@sellbridge/shared/catalog-availability";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createTestProduct,
  createTestStore,
  createTestTarget,
  createTestTenants,
  createWorkerTestEnvironment,
} from "../testing/fixtures.ts";
import { createPublishListingProcessor } from "./publish-listing.ts";

const persistence = vi.hoisted(() => ({ failNextPublishedSave: false }));

vi.mock("@sellbridge/database/repositories", async (importOriginal) => {
  const original = await importOriginal<typeof import("@sellbridge/database/repositories")>();
  return {
    ...original,
    markTargetPublished: async (...args: Parameters<typeof original.markTargetPublished>) => {
      if (persistence.failNextPublishedSave) {
        persistence.failNextPublishedSave = false;
        throw new Error("Connection terminated unexpectedly");
      }
      return original.markTargetPublished(...args);
    },
  };
});

const environment = createWorkerTestEnvironment();
const { database } = environment;
const mockConnector = environment.connectors.mock;
const publishProduct = vi.fn<MarketplaceConnector["publishProduct"]>(async (credentials, input) =>
  mockConnector.publishProduct(credentials, input),
);
const processPublish = createPublishListingProcessor({
  ...environment,
  connectors: {
    ...environment.connectors,
    mock: { ...environment.connectors.mock, publishProduct },
  },
  acquireRateLimit: async () => {},
  safetyUnits: 0,
});

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let tenantIds: string[] = [];
const extraCatalogs: { cleanup: () => Promise<void> }[] = [];
let connectedStoreId = "";
let disconnectedStoreId = "";

async function createTarget(title: string, storeId = connectedStoreId) {
  const tenantId = tenants.first;
  const targetId = await createTestTarget(database, {
    tenantId,
    productId: catalog.productId,
    storeId,
    title,
  });
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

async function productOfTarget(targetId: string) {
  const [row] = await database
    .select({ productId: schema.listings.supplierProductId })
    .from(schema.listingTargets)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.listingTargets.listingId))
    .where(eq(schema.listingTargets.id, targetId));
  if (!row) {
    throw new Error("produto do destino não encontrado");
  }
  return row.productId;
}

beforeAll(async () => {
  tenants = await createTestTenants(database, 2);
  tenantIds = tenants.ids;
  catalog = await createTestProduct(database, { sku: "W-1", title: "Produto worker", stock: 7 });
  connectedStoreId = (await createTestStore(environment, tenants.first, "connected")).id;
  disconnectedStoreId = (await createTestStore(environment, tenants.first, "disconnected")).id;
});

afterAll(async () => {
  await tenants.cleanup();
  await catalog.cleanup();
  for (const extra of extraCatalogs) {
    await extra.cleanup();
  }
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

  it("leaves a target alone while another job is publishing it", async () => {
    const { tenantId, targetId } = await createTarget("Produto já em publicação");
    await database
      .update(schema.listingTargets)
      .set({ status: "publishing" })
      .where(eq(schema.listingTargets.id, targetId));
    publishProduct.mockClear();

    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    expect(await processPublish(job)).toBe("not_pending");
    expect(publishProduct).not.toHaveBeenCalled();
    expect(await targetRow(targetId)).toMatchObject({ status: "publishing", attempts: 0 });
  });

  it("does not publish twice when the result cannot be saved", async () => {
    const { tenantId, targetId } = await createTarget("Produto salvo com falha no banco");
    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    publishProduct.mockClear();
    persistence.failNextPublishedSave = true;

    await expect(processPublish(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(await processPublish({ ...job, attemptsMade: 1 })).toBe("not_pending");
    expect(publishProduct).toHaveBeenCalledTimes(1);
    expect(await targetRow(targetId)).toMatchObject({ status: "publishing", attempts: 1 });
  });

  it("persists the remote creation guard and retains it across manual reprocessing", async () => {
    // Before the target: each target lists its own copy of the fixture product.
    await database
      .update(schema.supplierProducts)
      .set({ mercadoLivreAttributes: { BRAND: "Acme", MODEL: "A1" } })
      .where(eq(schema.supplierProducts.id, catalog.productId));
    const { tenantId, targetId } = await createTarget("Criação remota com resposta perdida");
    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    publishProduct.mockImplementationOnce(async (_credentials, input, options) => {
      expect(options?.creationStartedAt).toBeNull();
      expect(input.mercadoLivreAttributes).toEqual({ BRAND: "Acme", MODEL: "A1" });
      await options?.beforeCreate();
      expect((await targetRow(targetId)).creationStartedAt).toBeInstanceOf(Date);
      throw marketplaceError("remote response lost", { retryable: false });
    });
    await expect(processPublish(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect((await targetRow(targetId)).creationStartedAt).toBeInstanceOf(Date);
    await database
      .update(schema.listingTargets)
      .set({ status: "pending" })
      .where(eq(schema.listingTargets.id, targetId));
    publishProduct.mockImplementationOnce(async (_credentials, _input, options) => {
      expect(options?.creationStartedAt).toBeInstanceOf(Date);
      return { externalId: "MLB-recovered", externalUrl: null };
    });
    expect(await processPublish(job)).toBe("published");
    expect((await targetRow(targetId)).externalId).toBe("MLB-recovered");
  });

  it("clears the guard when reprocessing confirms the item never landed", async () => {
    const { tenantId, targetId } = await createTarget("Criação que nunca chegou ao marketplace");
    const startedAt = new Date(Date.now() - 15 * 60_000);
    await database
      .update(schema.listingTargets)
      .set({ creationStartedAt: startedAt })
      .where(eq(schema.listingTargets.id, targetId));
    publishProduct.mockImplementationOnce(async (_credentials, _input, options) => {
      expect(options?.creationStartedAt).toEqual(startedAt);
      await options?.creationAbsent();
      expect((await targetRow(targetId)).creationStartedAt).toBeNull();
      await options?.beforeCreate();
      return { externalId: "MLB-recreated", externalUrl: null };
    });
    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    expect(await processPublish(job)).toBe("published");
    expect((await targetRow(targetId)).externalId).toBe("MLB-recreated");
  });

  it("clears the durable guard when creation was definitively refused", async () => {
    const { tenantId, targetId } = await createTarget("Criação recusada pelo marketplace");
    publishProduct.mockImplementationOnce(async (_credentials, _input, options) => {
      await options?.beforeCreate();
      await options?.creationRejected();
      throw marketplaceError("creation refused", { retryable: false });
    });
    await expect(
      processPublish({
        data: { tenantId, listingTargetId: targetId },
        attemptsMade: 0,
        maxAttempts: 5,
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect((await targetRow(targetId)).creationStartedAt).toBeNull();
  });

  it("refuses a product taken out of the catalog after it was queued", async () => {
    const { tenantId, targetId } = await createTarget("Produto desativado na fila");
    await database
      .update(schema.supplierProducts)
      .set({ active: false })
      .where(eq(schema.supplierProducts.id, await productOfTarget(targetId)));
    publishProduct.mockClear();

    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    await expect(processPublish(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(publishProduct).not.toHaveBeenCalled();
    expect(await targetRow(targetId)).toMatchObject({
      status: "error",
      errorReason: unavailableMessage("product_inactive"),
    });
  });

  it("refuses every product of a supplier deactivated after it was queued", async () => {
    const own = await createTestProduct(database, {
      sku: "W-INATIVO",
      title: "Produto de fornecedor inativo",
      stock: 3,
    });
    extraCatalogs.push(own);
    const tenantId = tenants.first;
    const targetId = await createTestTarget(database, {
      tenantId,
      productId: own.productId,
      storeId: connectedStoreId,
      title: "Produto de fornecedor desativado",
    });
    await database
      .update(schema.suppliers)
      .set({ active: false })
      .where(eq(schema.suppliers.id, own.supplierId));
    publishProduct.mockClear();

    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    await expect(processPublish(job)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(publishProduct).not.toHaveBeenCalled();
    expect((await targetRow(targetId)).errorReason).toBe(unavailableMessage("supplier_inactive"));
  });

  it("publishes for a reseller anywhere in Brazil, whatever address an older profile kept", async () => {
    const [, tenantId] = tenantIds;
    if (tenantId === undefined) {
      throw new Error("tenant ausente");
    }
    await database
      .insert(schema.tenantProfile)
      .values({ tenantId, cep: "69900062", state: "AC", city: "Rio Branco" });
    const store = await createTestStore(environment, tenantId, "connected");
    const targetId = await createTestTarget(database, {
      tenantId,
      productId: catalog.productId,
      storeId: store.id,
      title: "Produto vendido do Acre",
    });

    const job = { data: { tenantId, listingTargetId: targetId }, attemptsMade: 0, maxAttempts: 5 };
    expect(await processPublish(job)).toBe("published");
    expect((await targetRow(targetId)).errorReason).toBeNull();
  });

  it("rejects malformed payloads", async () => {
    await expect(
      processPublish({ data: { listingTargetId: "x" }, attemptsMade: 0, maxAttempts: 1 }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
