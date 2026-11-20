import type {
  ProductModelDetail,
  reserveShortItems,
  saveProductModelDraft,
} from "@sellbridge/database/repositories";
import { conflictError, hasErrorCode } from "@sellbridge/shared/errors";
import type {
  CatalogSaveModelDraftInput,
  ModelDraftValues,
} from "@sellbridge/shared/supplier-panel-catalog-schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  environment: { PRODUCT_GRID_ENABLED: false },
  save: vi.fn<typeof saveProductModelDraft>(),
  reserveShort: vi.fn<typeof reserveShortItems>(),
  enqueue: vi.fn<() => Promise<void>>(),
  log: vi.fn<(event: string, fields: Record<string, unknown>) => void>(),
}));
vi.mock("@/lib/server/environment", () => ({ environment: mocks.environment }));
vi.mock("@sellbridge/database/repositories", () => ({
  saveProductModelDraft: mocks.save,
  reserveShortItems: mocks.reserveShort,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/queues", () => ({ enqueueStockPriceSync: mocks.enqueue }));
vi.mock("@sellbridge/shared/logger", () => ({
  logger: { info: mocks.log, warn: mocks.log, error: mocks.log },
}));
import { loadPanelModelForm, writePanelModelDraft } from "./grid.server";

const input = {
  supplierId: "00000000-0000-4000-8000-000000000001",
  modelId: "00000000-0000-4000-8000-000000000002",
} as const;

const modelValues: ModelDraftValues = {
  title: "Tênis Casual",
  description: "",
  categoryId: null,
  imageUrls: [],
  mercadoLivreAttributes: {},
  mercadoLivreCategoryId: null,
  mercadoLivreCategoryName: null,
  warrantyType: null,
  warrantyDays: null,
  videoUrl: null,
  madeToOrderDays: null,
  carrierOnly: false,
  fiscal: {
    ncm: null,
    origin: null,
    unit: null,
    cest: null,
    netWeightGrams: null,
    cfopInState: null,
    cfopOutOfState: null,
    icmsCode: null,
    pisCofinsCst: null,
  },
};

function savedModel(reviewStatus: string): ProductModelDetail {
  return {
    id: input.modelId,
    supplierId: input.supplierId,
    updatedAt: new Date("2026-11-19T12:00:00Z"),
    values: modelValues,
    colors: [{ name: "Preto", imageUrls: [] }],
    sizes: ["38"],
    combinations: [
      {
        id: "00000000-0000-4000-8000-000000000003",
        color: "Preto",
        size: "38",
        sku: "TEN-P-38",
        gtin: null,
        netWeightGrams: null,
        stock: 4,
        reservedStock: 0,
        costCents: 5000,
        suggestedPriceCents: 9990,
        active: true,
        reviewStatus,
      },
    ],
  };
}

const draftInput: CatalogSaveModelDraftInput = {
  ...input,
  values: modelValues,
  grid: { colors: [], sizes: [], combinations: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.environment.PRODUCT_GRID_ENABLED = false;
  mocks.enqueue.mockResolvedValue(undefined);
  mocks.reserveShort.mockResolvedValue(0);
});

describe("grid switch", () => {
  it("answers the grid form as missing while grids are switched off", async () => {
    const attempt = loadPanelModelForm(input);

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "NOT_FOUND"));
  });

  it("saves nothing while grids are switched off", async () => {
    const attempt = writePanelModelDraft(draftInput);

    await expect(attempt).rejects.toSatisfy((error) => hasErrorCode(error, "NOT_FOUND"));
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

describe("writePanelModelDraft", () => {
  it("answers a conflict as a result the form can show", async () => {
    mocks.environment.PRODUCT_GRID_ENABLED = true;
    mocks.save.mockRejectedValue(conflictError("Este produto mudou em outra janela"));

    const result = await writePanelModelDraft(draftInput);

    expect(result).toEqual({ saved: false, conflict: "Este produto mudou em outra janela" });
  });

  it("sends the stock of combinations on sale to the listings", async () => {
    mocks.environment.PRODUCT_GRID_ENABLED = true;
    mocks.save.mockResolvedValue(savedModel("approved"));

    await writePanelModelDraft(draftInput);

    expect(mocks.reserveShort).toHaveBeenCalledWith({}, ["00000000-0000-4000-8000-000000000003"]);
    expect(mocks.enqueue).toHaveBeenCalled();
  });

  it("leaves the listings alone while every combination is a draft", async () => {
    mocks.environment.PRODUCT_GRID_ENABLED = true;
    mocks.save.mockResolvedValue(savedModel("draft"));

    await writePanelModelDraft(draftInput);

    expect(mocks.reserveShort).not.toHaveBeenCalled();
  });
});
