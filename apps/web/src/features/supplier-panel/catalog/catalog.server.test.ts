import type {
  approveSupplierPanelProduct,
  reserveShortItems,
  saveSupplierPanelDraft,
} from "@sellbridge/database/repositories";
import { conflictError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn<typeof saveSupplierPanelDraft>(),
  approve: vi.fn<typeof approveSupplierPanelProduct>(),
  reserveShort: vi.fn<typeof reserveShortItems>(),
  enqueue: vi.fn<() => Promise<void>>(),
  log: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  saveSupplierPanelDraft: mocks.save,
  approveSupplierPanelProduct: mocks.approve,
  reserveShortItems: mocks.reserveShort,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({ enqueueStockPriceSync: mocks.enqueue }));
vi.mock("@sellbridge/shared/logger", () => ({ logger: { warn: mocks.log, error: mocks.log } }));
import { writePanelApproval, writePanelDraft } from "./catalog.server";

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
      message: "Não foi possível salvar o produto. Tente novamente.",
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
