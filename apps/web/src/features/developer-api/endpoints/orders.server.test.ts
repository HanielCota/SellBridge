import type { DeveloperScope } from "@sellbridge/shared/developer-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  getOrganizationForDeveloper: vi.fn<() => Promise<unknown>>(),
  getOrderDetail: vi.fn<() => Promise<unknown>>(),
  findSealedShippingAddress: vi.fn<() => Promise<string | null>>(),
  openShippingAddress: vi.fn<() => unknown>(),
}));

vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/marketplaces", () => ({ tokenCipher: {} }));
vi.mock("@sellbridge/marketplaces", () => ({ openShippingAddress: mocks.openShippingAddress }));
vi.mock("@sellbridge/database/repositories", () => ({
  getOrganizationForDeveloper: mocks.getOrganizationForDeveloper,
  getOrderDetail: mocks.getOrderDetail,
  findSealedShippingAddress: mocks.findSealedShippingAddress,
  orderFinanceInput: () => ({
    totalCents: 5000,
    marketplaceFeeCents: 0,
    sellerShippingCents: null,
    items: [],
    adjustments: [],
    status: "paid",
  }),
}));

const { getDeveloperOrder } = await import("./orders.server");

const ORGANIZATION_ID = "org-1";
const ORDER_ID = "6f1c2c8e-8f0e-4c7a-9a39-3d4b2a1e0f11";
const ADDRESS = { recipient: "Mariana", street: "Rua A", number: "10", city: "Campinas" };

function callerWith(scopes: DeveloperScope[]) {
  return {
    developerApiKeyId: "key-1",
    createdByUserId: "dev-1",
    name: "Painel",
    prefix: "sb_dev_abcdef",
    scopes,
    expiresAt: new Date("2026-12-25T12:00:00Z"),
  };
}

function orderDetail() {
  return {
    id: ORDER_ID,
    externalOrderId: "ML-1",
    storeConnectionId: "6f1c2c8e-8f0e-4c7a-9a39-3d4b2a1e0f12",
    storeName: "Loja",
    status: "paid",
    buyerName: "Mariana",
    orderedAt: new Date("2026-11-20T12:00:00Z"),
    paidAt: null,
    deliveredAt: null,
    items: [],
    adjustments: [],
  };
}

async function readOrder(scopes: DeveloperScope[]) {
  const result = await getDeveloperOrder.handle({
    caller: callerWith(scopes),
    params: { organizationId: ORGANIZATION_ID, orderId: ORDER_ID },
    query: {},
    requestId: "request-1",
    now: new Date("2026-11-25T12:00:00Z"),
  });
  return z.object({ data: z.record(z.string(), z.unknown()) }).parse(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationForDeveloper.mockResolvedValue({ id: ORGANIZATION_ID });
  mocks.getOrderDetail.mockResolvedValue(orderDetail());
  mocks.findSealedShippingAddress.mockResolvedValue("sealed");
  mocks.openShippingAddress.mockReturnValue(ADDRESS);
});

describe("getDeveloperOrder", () => {
  it("leaves the shipping address out for keys without the personal-data option", async () => {
    const result = await readOrder(["orders:read"]);

    expect(result.data).not.toHaveProperty("shippingAddress");
    expect(result.data.buyerName).toBe("Mariana");
    expect(mocks.findSealedShippingAddress).not.toHaveBeenCalled();
  });

  it("adds the shipping address for keys with the personal-data option", async () => {
    const result = await readOrder(["orders:read", "buyers:personal"]);

    expect(result.data.shippingAddress).toEqual(ADDRESS);
  });

  it("reads the order of the organization in the path", async () => {
    await readOrder(["orders:read"]);

    expect(mocks.getOrderDetail).toHaveBeenCalledWith({}, ORGANIZATION_ID, ORDER_ID);
  });

  it("refuses an organization that does not exist before reading the order", async () => {
    mocks.getOrganizationForDeveloper.mockRejectedValue(new Error("not found"));

    const reading = readOrder(["orders:read"]);

    await expect(reading).rejects.toThrow("not found");
    expect(mocks.getOrderDetail).not.toHaveBeenCalled();
  });
});
