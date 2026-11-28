import { LABEL_NOT_READY_CAUSE, marketplaceError } from "@sellbridge/marketplaces";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORDER_ID = "0b6f7c1e-3f1a-4c55-9a51-6a2f8d2c9e10";

const mocks = vi.hoisted(() => ({
  recordLabelsWaiting: vi.fn<(...input: unknown[]) => Promise<void>>(),
  shopeePickupStep: vi.fn<(...input: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  getSupplierShipment: vi.fn<() => Promise<void>>(),
  recordLabelsPrinted: vi.fn<() => Promise<void>>(),
  recordLabelsWaiting: mocks.recordLabelsWaiting,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));
vi.mock("@/lib/server/app-origin", () => ({ appOriginFor: () => "https://app.example.test" }));
vi.mock("@/lib/server/tenant-session", () => ({
  requireSellerRequest: async () => ({ tenantId: "tenant" }),
}));
vi.mock("@/lib/server/panel-label-access", () => ({
  assertSupplierLabelAvailable: vi.fn<() => void>(),
  panelLabelIds: () => null,
  panelLabelShipmentId: vi.fn<() => Promise<string>>(),
}));
vi.mock("@/features/fulfillment/marketplace.server", () => ({
  loadMarketplaceLabel: vi.fn<() => Promise<void>>(),
  shopeePickupStep: mocks.shopeePickupStep,
}));

import { Route } from "@/routes/api/pedidos/$orderId/etiqueta";

function resellerLabelRequest(): Request {
  return new Request(`https://app.example.test/api/pedidos/${ORDER_ID}/etiqueta`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "same-origin",
    },
    body: "solicitar=revenda",
  });
}

beforeEach(() => {
  mocks.recordLabelsWaiting.mockReset();
  mocks.shopeePickupStep.mockReset();
});

describe("label route", () => {
  it("records the label as waiting when Shopee is still preparing it at the pickup step", async () => {
    mocks.shopeePickupStep.mockRejectedValue(
      marketplaceError("A Shopee ainda está preparando a etiqueta.", {
        retryable: true,
        causes: [LABEL_NOT_READY_CAUSE],
      }),
    );
    const post = Route.options.server?.handlers;
    if (post === undefined || typeof post === "function" || post.POST === undefined) {
      throw new Error("The label route has no POST handler");
    }

    const response: unknown = await Reflect.apply(post.POST, undefined, [
      { request: resellerLabelRequest(), params: { orderId: ORDER_ID } },
    ]);

    expect(response).toBeInstanceOf(Response);
    expect(response instanceof Response ? response.status : null).toBe(400);
    expect(mocks.recordLabelsWaiting).toHaveBeenCalledWith({}, [ORDER_ID]);
  });
});
