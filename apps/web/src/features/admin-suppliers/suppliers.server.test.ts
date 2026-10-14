import type {
  importSupplierProducts,
  previewSupplierProductImport,
  saveAdminSupplier,
  saveAdminSupplierProduct,
  setAdminSupplierActive,
  setAdminSupplierProductActive,
  SupplierProductImportPlan,
} from "@sellbridge/database/repositories";
import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn<typeof previewSupplierProductImport>(),
  importProducts: vi.fn<typeof importSupplierProducts>(),
  saveProduct: vi.fn<typeof saveAdminSupplierProduct>(),
  saveSupplier: vi.fn<typeof saveAdminSupplier>(),
  setSupplierActive: vi.fn<typeof setAdminSupplierActive>(),
  setProductActive: vi.fn<typeof setAdminSupplierProductActive>(),
  enqueue: vi.fn<() => Promise<void>>(),
  warn: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  previewSupplierProductImport: mocks.preview,
  importSupplierProducts: mocks.importProducts,
  saveAdminSupplierProduct: mocks.saveProduct,
  saveAdminSupplier: mocks.saveSupplier,
  setAdminSupplierActive: mocks.setSupplierActive,
  setAdminSupplierProductActive: mocks.setProductActive,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({ enqueueStockPriceSync: mocks.enqueue }));
vi.mock("@sellbridge/shared/logger", () => ({ logger: { warn: mocks.warn } }));
import {
  confirmAdminProductCsv,
  previewAdminProductCsv,
  writeAdminProduct,
  writeAdminSupplier,
  writeProductActive,
  writeSupplierActive,
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
const savedSupplier = {
  id: supplierId,
  name: "Fornecedor",
  niche: "Casa",
  description: "",
  state: "MG",
  city: "Belo Horizonte",
  logoUrl: null,
  active: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
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
      reservedStock: 0,
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

  it("enqueues synchronization after saving a supplier, whose coverage may have shrunk", async () => {
    mocks.saveSupplier.mockResolvedValue(savedSupplier);

    await expect(
      writeAdminSupplier({
        supplierId,
        name: "Fornecedor",
        niche: "Casa",
        description: "",
        state: "MG",
        city: "Belo Horizonte",
        logoUrl: null,
        coverage: [{ state: "MG", city: null }],
      }),
    ).resolves.toEqual({ ...savedSupplier, synchronizationQueued: true });
    expect(mocks.saveSupplier.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueue.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("enqueues synchronization when a supplier or product is switched off", async () => {
    mocks.setSupplierActive.mockResolvedValue({ ...savedSupplier, active: false });
    mocks.setProductActive.mockResolvedValue({
      ...product,
      id: "6f1b2c4e-0d7a-4c8e-9a51-2f3b4c5d6e7f",
      reservedStock: 0,
      active: false,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });

    await expect(writeSupplierActive({ supplierId, active: false })).resolves.toMatchObject({
      active: false,
      synchronizationQueued: true,
    });
    await expect(
      writeProductActive({
        supplierId,
        productId: "6f1b2c4e-0d7a-4c8e-9a51-2f3b4c5d6e7f",
        active: false,
      }),
    ).resolves.toMatchObject({ active: false, synchronizationQueued: true });
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  });
});
