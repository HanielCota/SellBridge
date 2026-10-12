import type {
  importSupplierProducts,
  previewSupplierProductImport,
  saveAdminSupplierProduct,
  SupplierProductImportPlan,
} from "@sellbridge/database/repositories";
import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn<typeof previewSupplierProductImport>(),
  importProducts: vi.fn<typeof importSupplierProducts>(),
  saveProduct: vi.fn<typeof saveAdminSupplierProduct>(),
  enqueue: vi.fn<() => Promise<void>>(),
  warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  previewSupplierProductImport: mocks.preview,
  importSupplierProducts: mocks.importProducts,
  saveAdminSupplierProduct: mocks.saveProduct,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({ enqueueStockPriceSync: mocks.enqueue }));
vi.mock("@sellbridge/shared/logger", () => ({ logger: { warn: mocks.warn } }));
import {
  confirmAdminProductCsv,
  previewAdminProductCsv,
  writeAdminProduct,
} from "./suppliers.server";

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";
const content = "sku;titulo;custo;estoque\nA;Produto;12,90;1";
const product = {
  supplierId,
  sku: "A",
  title: "Produto",
  description: "",
  costCents: 1290,
  suggestedPriceCents: 1990,
  stock: 1,
  categoryId: null,
  imageUrls: [],
  mercadoLivreAttributes: {},
  active: true,
};
function importPlan(revision = "initial"): SupplierProductImportPlan {
  return { created: 1, updated: 0, errors: [], products: [product], revision };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.preview.mockResolvedValue(importPlan());
  mocks.enqueue.mockResolvedValue(undefined);
  mocks.importProducts.mockImplementation(async (_database, input) => {
    input.validatePreview(importPlan());
    return { created: 1, updated: 0 };
  });
});

describe("admin CSV orchestration", () => {
  it("confirms the exact preview and enqueues synchronization after commit", async () => {
    const preview = await previewAdminProductCsv({ supplierId, content });
    expect(preview).toMatchObject({ created: 1, updated: 0, errors: [] });
    await expect(
      confirmAdminProductCsv({ supplierId, content, previewToken: preview.previewToken }),
    ).resolves.toEqual({ created: 1, updated: 0, synchronizationQueued: true });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.importProducts.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueue.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("rejects content changed since the preview", async () => {
    const preview = await previewAdminProductCsv({ supplierId, content });
    await expect(
      confirmAdminProductCsv({
        supplierId,
        content: content.replace("12,90", "99,90"),
        previewToken: preview.previewToken,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("rejects a catalog changed since the preview", async () => {
    const preview = await previewAdminProductCsv({ supplierId, content });
    mocks.importProducts.mockImplementation(async (_database, input) => {
      input.validatePreview(importPlan("changed"));
      return { created: 1, updated: 0 };
    });
    await expect(
      confirmAdminProductCsv({ supplierId, content, previewToken: preview.previewToken }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("blocks invalid CSV rows even if a caller bypasses the UI", async () => {
    await expect(
      confirmAdminProductCsv({
        supplierId,
        content: "sku;titulo;custo;estoque\nA;Ruim;xyz;1",
        previewToken: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(mocks.importProducts).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("reports deferred synchronization without claiming the committed import failed", async () => {
    mocks.enqueue.mockRejectedValue(new Error("Redis unavailable"));
    const preview = await previewAdminProductCsv({ supplierId, content });
    await expect(
      confirmAdminProductCsv({ supplierId, content, previewToken: preview.previewToken }),
    ).resolves.toMatchObject({ created: 1, synchronizationQueued: false });
    expect(mocks.warn).toHaveBeenCalledWith("admin.catalog_sync_deferred", {
      error: expect.any(Error),
    });
  });

  it("enqueues synchronization for a manual product update", async () => {
    mocks.saveProduct.mockResolvedValue({
      ...product,
      id: "e937a566-b7bc-4305-b3c0-448e7133fcfe",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await expect(writeAdminProduct(product)).resolves.toMatchObject({
      synchronizationQueued: true,
    });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
  });

  it("bounds the wait when Redis never responds after the import commits", async () => {
    vi.useFakeTimers();
    try {
      mocks.enqueue.mockImplementation(async () => await new Promise<void>(() => undefined));
      const preview = await previewAdminProductCsv({ supplierId, content });
      const confirmation = confirmAdminProductCsv({
        supplierId,
        content,
        previewToken: preview.previewToken,
      });
      await vi.advanceTimersByTimeAsync(3001);
      await expect(confirmation).resolves.toMatchObject({
        created: 1,
        synchronizationQueued: false,
      });
      expect(mocks.warn).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
