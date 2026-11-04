import type {
  approveSupplierPanelProduct,
  deleteUnsoldSupplierPanelProduct,
  reserveShortItems,
  saveSupplierPanelDraft,
  setAdminSupplierProductActive,
  submitSupplierPanelProduct,
} from "@sellbridge/database/repositories";
import { conflictError, notFoundError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn<typeof saveSupplierPanelDraft>(),
  approve: vi.fn<typeof approveSupplierPanelProduct>(),
  reserveShort: vi.fn<typeof reserveShortItems>(),
  setActive: vi.fn<typeof setAdminSupplierProductActive>(),
  remove: vi.fn<typeof deleteUnsoldSupplierPanelProduct>(),
  submit: vi.fn<typeof submitSupplierPanelProduct>(),
  enqueue: vi.fn<() => Promise<void>>(),
  log: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  saveSupplierPanelDraft: mocks.save,
  approveSupplierPanelProduct: mocks.approve,
  reserveShortItems: mocks.reserveShort,
  setAdminSupplierProductActive: mocks.setActive,
  deleteUnsoldSupplierPanelProduct: mocks.remove,
  submitSupplierPanelProduct: mocks.submit,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({ enqueueStockPriceSync: mocks.enqueue }));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { info: mocks.log, warn: mocks.log, error: mocks.log },
}));
import {
  writePanelActive,
  writePanelApproval,
  writePanelDeletion,
  writePanelDraft,
  writePanelSubmission,
} from "./catalog.server";

const supplierId = "b90fe97c-fd21-4ce8-ab70-908f233c7038";
const productId = "e937a566-b7bc-4305-b3c0-448e7133fcfe";
const input = {
  supplierId,
  productId,
  values: {
    sku: "A",
    title: "",
    description: "",
    costCents: 0,
    suggestedPriceCents: 0,
    stock: 0,
    categoryId: null,
    imageUrls: [],
  },
};
type Stored = Awaited<ReturnType<typeof saveSupplierPanelDraft>>;
function stored(reviewStatus: Stored["reviewStatus"]): Stored {
  const now = new Date("2026-10-16T12:00:00Z");
  return {
    ...input.values,
    id: productId,
    supplierId,
    mercadoLivreAttributes: {},
    reservedStock: 0,
    active: true,
    reviewStatus,
    rejectionReasons: [],
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
    categoryName: null,
    categorySlug: null,
    completeness: { score: 0, blocking: [], improvements: [], canSubmit: true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueue.mockResolvedValue();
  mocks.reserveShort.mockResolvedValue(0);
});

describe("writePanelDraft", () => {
  it("answers a version conflict as a result the form can show", async () => {
    mocks.save.mockRejectedValue(conflictError("Este produto foi alterado em outra janela"));
    await expect(writePanelDraft(input)).resolves.toEqual({
      saved: false,
      conflict: "Este produto foi alterado em outra janela",
    });
  });

  it("hides a database failure behind a clear message and logs it", async () => {
    mocks.save.mockRejectedValue(new Error("connection reset"));
    await expect(writePanelDraft(input)).rejects.toMatchObject({
      message: "Não foi possível salvar o produto, tente de novo.",
    });
    expect(mocks.log).toHaveBeenCalledWith("supplier_panel.draft_save_failed", {
      error: expect.any(Error),
    });
  });

  it("syncs resellers' listings only when an approved product changed", async () => {
    mocks.save.mockResolvedValue(stored("draft"));
    await writePanelDraft(input);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    mocks.save.mockResolvedValue(stored("approved"));
    await expect(writePanelDraft(input)).resolves.toMatchObject({ saved: true });
    expect(mocks.reserveShort).toHaveBeenCalledWith({}, [productId]);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe("writePanelApproval", () => {
  it("keeps the approval when the shortage reservation fails", async () => {
    mocks.approve.mockResolvedValue(stored("approved"));
    mocks.reserveShort.mockRejectedValue(new Error("lock timeout"));
    await expect(writePanelApproval({ supplierId, productId }, "admin")).resolves.toMatchObject({
      reviewStatus: "approved",
    });
    expect(mocks.approve).toHaveBeenCalledWith({}, { supplierId, productId, reviewerId: "admin" });
    expect(mocks.log).toHaveBeenCalledWith("supplier_panel.short_reservation_failed", {
      productId,
      error: expect.any(Error),
    });
  });
});

describe("writePanelActive", () => {
  it("takes the supplier's own product off sale and asks the worker to sync", async () => {
    mocks.setActive.mockResolvedValue({
      product: { ...stored("approved"), active: false },
      pausedTargets: 2,
    });

    const result = await writePanelActive({ supplierId, productId, active: false });

    expect(mocks.setActive).toHaveBeenCalledWith({}, { supplierId, productId, active: false });
    expect(result).toEqual({ id: productId, active: false, pausedTargets: 2 });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledWith("supplier_panel.product_active_changed", {
      supplierId,
      productId,
      active: false,
      pausedTargets: 2,
    });
  });

  it("passes a product of another supplier through as not found", async () => {
    mocks.setActive.mockRejectedValue(notFoundError("Produto não encontrado neste fornecedor"));

    await expect(writePanelActive({ supplierId, productId, active: false })).rejects.toMatchObject({
      message: "Produto não encontrado neste fornecedor",
    });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});

describe("writePanelDeletion", () => {
  it("deletes the supplier's own unsold product and traces it", async () => {
    mocks.remove.mockResolvedValue();

    const result = await writePanelDeletion({ supplierId, productId });

    expect(mocks.remove).toHaveBeenCalledWith({}, { supplierId, productId });
    expect(result).toEqual({ id: productId });
    expect(mocks.log).toHaveBeenCalledWith("supplier_panel.product_deleted", {
      supplierId,
      productId,
    });
  });

  it("passes the refusal of a published or sold product through unchanged", async () => {
    mocks.remove.mockRejectedValue(conflictError("Este produto já foi publicado"));

    await expect(writePanelDeletion({ supplierId, productId })).rejects.toMatchObject({
      message: "Este produto já foi publicado",
    });
    expect(mocks.log).not.toHaveBeenCalledWith("supplier_panel.product_deleted", expect.anything());
  });
});

describe("writePanelSubmission", () => {
  it("puts a published product on the resellers' listings right away", async () => {
    mocks.submit.mockResolvedValue(stored("approved"));

    const product = await writePanelSubmission({ supplierId, productId });

    expect(product.reviewStatus).toBe("approved");
    expect(mocks.reserveShort).toHaveBeenCalledWith({}, [productId]);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });
});
