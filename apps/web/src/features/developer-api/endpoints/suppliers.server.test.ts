import { logger } from "@sellbridge/shared/logger";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { developerRouteHandler } from "../developer-endpoint.server";

const { listAdminSupplierProducts, recordDeveloperApiRequest } = vi.hoisted(() => ({
  listAdminSupplierProducts: vi.fn<() => Promise<unknown>>(),
  recordDeveloperApiRequest: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({ environment: { DEVELOPER_EMAILS: [] } }));
vi.mock("@sellbridge/database/repositories", () => ({
  listAdminSupplierProducts,
  recordDeveloperApiRequest,
}));
vi.mock("../developer-address-limit.server", () => ({
  limitDeveloperAddress: async () => ({ ok: true, value: null }),
}));
vi.mock("../developer-authenticate.server", () => ({
  authenticateDeveloperKey: async () => ({
    ok: true,
    value: {
      developerApiKeyId: "key-1",
      createdByUserId: "dev-1",
      prefix: "sb_dev_abcdef",
      scopes: ["suppliers:read"],
    },
  }),
  requireDeveloperScope: () => ({ ok: true }),
}));
vi.mock("../developer-rate-limit.server", () => ({
  enforceDeveloperRateLimit: async () => ({ ok: true, value: {} }),
}));

const { listDeveloperSupplierProducts } = await import("./suppliers.server");
const supplierId = "a5ea1ed3-0b19-4f1e-9b70-58a4d8cb4567";
const now = new Date("2026-11-25T12:00:00Z");
const imageUrls = ["https://images.example.com/front.jpg", "https://images.example.com/back.jpg"];
const product = {
  id: "6f1c2c8e-8f0e-4c7a-9a39-3d4b2a1e0f11",
  sku: "SB-1",
  title: "Produto",
  color: null,
  size: null,
  costCents: 1000,
  suggestedPriceCents: null,
  stock: 5,
  reservedStock: 2,
  active: true,
  reviewStatus: "approved",
  createdAt: now,
  updatedAt: now,
};

function readProducts() {
  return developerRouteHandler(listDeveloperSupplierProducts)({
    request: new Request(`https://sellbridge.example/api/dev/v1/suppliers/${supplierId}/products`),
    params: { supplierId },
  });
}

beforeEach(() => {
  listAdminSupplierProducts.mockReset();
  recordDeveloperApiRequest.mockReset();
  recordDeveloperApiRequest.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("returns photos in order and distinguishes available stock from shelf stock", async () => {
  listAdminSupplierProducts.mockResolvedValue({
    items: [
      { ...product, imageUrls },
      {
        ...product,
        id: "b6a7ba49-231b-4ed1-a662-c73185e8dda9",
        sku: "SB-2",
        imageUrls: [],
        stock: 1,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 2,
    totalPages: 1,
  });

  const response = await readProducts();

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    data: [
      { imageUrls, stock: 5, reservedStock: 2, availableStock: 3 },
      { imageUrls: [], stock: 1, reservedStock: 2, availableStock: 0 },
    ],
    pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
  });
});

it("returns a traceable error if stored data cannot satisfy the response contract", async () => {
  listAdminSupplierProducts.mockResolvedValue({
    items: [{ ...product, title: null, imageUrls }],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });

  const response = await readProducts();
  const requestId = response.headers.get("x-request-id");

  expect(response.status).toBe(500);
  expect(requestId).not.toBeNull();
  expect(await response.json()).toMatchObject({ code: "internal_error", requestId });
});

it("logs which field broke the response contract without its value", async () => {
  const reportError = vi.spyOn(logger, "error").mockImplementation(() => undefined);
  listAdminSupplierProducts.mockResolvedValue({
    items: [{ ...product, title: null, imageUrls }],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });

  await readProducts();

  expect(reportError).toHaveBeenCalledWith(
    "developer_api.response_invalid",
    expect.objectContaining({ issuePaths: ["data.0.title"] }),
  );
  expect(JSON.stringify(reportError.mock.calls)).not.toContain(product.sku);
});

it("keeps an audit event with the request and resource IDs if the usage write fails", async () => {
  const reportError = vi.spyOn(logger, "error").mockImplementation(() => undefined);
  recordDeveloperApiRequest.mockRejectedValueOnce(new Error("Database unavailable"));
  listAdminSupplierProducts.mockResolvedValue({
    items: [{ ...product, imageUrls }],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });

  const response = await readProducts();

  expect(response.status).toBe(200);
  expect(reportError).toHaveBeenCalledWith(
    "developer_api.usage_not_recorded",
    expect.objectContaining({
      requestId: response.headers.get("x-request-id"),
      developerApiKeyId: "key-1",
      operation: "listSupplierProducts",
      resourceId: supplierId,
      status: 200,
      personalData: false,
    }),
  );
});

it("keeps the reason the usage write failed in the audit event", async () => {
  const reportError = vi.spyOn(logger, "error").mockImplementation(() => undefined);
  const failure = new Error("Database unavailable");
  recordDeveloperApiRequest.mockRejectedValueOnce(failure);
  listAdminSupplierProducts.mockResolvedValue({
    items: [{ ...product, imageUrls }],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  });

  await readProducts();

  expect(reportError).toHaveBeenCalledWith(
    "developer_api.usage_not_recorded",
    expect.objectContaining({ error: failure }),
  );
});
