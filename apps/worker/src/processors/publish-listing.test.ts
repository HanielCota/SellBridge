import { UnrecoverableError } from "bullmq";
import { eq } from "drizzle-orm";
import { schema } from "@sellbridge/database";
import type { MarketplaceConnector } from "@sellbridge/marketplaces";
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
});

let tenants: Awaited<ReturnType<typeof createTestTenants>>;
let catalog: Awaited<ReturnType<typeof createTestProduct>>;
let tenantIds: string[] = [];
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

  it("rejects malformed payloads", async () => {
    await expect(
      processPublish({ data: { listingTargetId: "x" }, attemptsMade: 0, maxAttempts: 1 }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });
});
