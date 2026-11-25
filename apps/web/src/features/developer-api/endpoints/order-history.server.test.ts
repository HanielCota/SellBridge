import { notFoundError } from "@sellbridge/shared/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationForDeveloper: vi.fn<() => Promise<unknown>>(),
  findSealedShippingAddress: vi.fn<() => Promise<string | null>>(),
  listOrderStatusChanges: vi.fn<() => Promise<unknown[]>>(),
  listOrderClaims: vi.fn<() => Promise<unknown[]>>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/environment", () => ({ environment: { DEVELOPER_EMAILS: [] } }));
vi.mock("@sellbridge/database/repositories", () => mocks);

const { getDeveloperOrderHistory } = await import("./order-history.server");

const ORDER_ID = "6f1c2c8e-8f0e-4c7a-9a39-3d4b2a1e0f11";

function readHistory() {
  return getDeveloperOrderHistory.handle({
    caller: {
      developerApiKeyId: "key-1",
      createdByUserId: "dev-1",
      name: "Painel",
      prefix: "sb_dev_abcdef",
      scopes: ["orders:read"],
      expiresAt: new Date("2026-12-25T12:00:00Z"),
    },
    params: { organizationId: "org-1", orderId: ORDER_ID },
    query: {},
    requestId: "request-1",
    now: new Date("2026-11-25T12:00:00Z"),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationForDeveloper.mockResolvedValue({ id: "org-1" });
  mocks.findSealedShippingAddress.mockResolvedValue("sealed");
  mocks.listOrderStatusChanges.mockResolvedValue([
    { status: "paid", at: new Date("2026-11-01T13:00:00Z") },
  ]);
  mocks.listOrderClaims.mockResolvedValue([]);
});

describe("getDeveloperOrderHistory", () => {
  it("returns the status changes of the order with dates in ISO", async () => {
    const history = await readHistory();

    expect(history.data).toEqual({
      statusChanges: [{ status: "paid", at: "2026-11-01T13:00:00.000Z" }],
      claims: [],
    });
  });

  it("refuses an order of another organization", async () => {
    mocks.findSealedShippingAddress.mockRejectedValue(notFoundError("Pedido não encontrado"));

    await expect(readHistory()).rejects.toThrow("Pedido não encontrado");
    expect(mocks.listOrderClaims).not.toHaveBeenCalled();
  });
});
