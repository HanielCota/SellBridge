import { beforeEach, describe, expect, it, vi } from "vitest";

const SHIPMENT_ID = "8f0c9a52-6f6e-4c9a-9a39-1d2b3c4d5e6f";
const ORDER_ID = "order-a";

interface ParcelRow {
  shipmentId: string;
  orderId: string;
  resellerNoteSource: string | null;
  remessaAuthorized: boolean;
  labelReleased: boolean;
}

const mocks = vi.hoisted(() => ({
  parcels: [] as ParcelRow[],
  release: vi.fn<(...input: unknown[]) => Promise<void>>(),
}));
vi.mock("@sellbridge/database/repositories", () => ({
  findOnBehalfLabelState: async () => ({
    tenantId: "tenant",
    orderId: ORDER_ID,
    marketplace: "mercado_livre",
    release: null,
  }),
  findOnBehalfLabelParcels: async () => mocks.parcels,
  releaseOnBehalfLabel: mocks.release,
}));
vi.mock("@/lib/server/database", () => ({ database: {} }));

import { releaseStaffOnBehalfLabel } from "./on-behalf-label.server";

const release = {
  shipmentId: SHIPMENT_ID,
  userId: "staff",
  role: "supervisor" as const,
  reason: "Bling do fornecedor fora do ar",
};

beforeEach(() => {
  mocks.release.mockReset();
});

describe("releaseStaffOnBehalfLabel", () => {
  it("releases a parcel whose own notes hold the label", async () => {
    mocks.parcels = [
      {
        shipmentId: SHIPMENT_ID,
        orderId: ORDER_ID,
        resellerNoteSource: "uploaded",
        remessaAuthorized: false,
        labelReleased: false,
      },
    ];

    await releaseStaffOnBehalfLabel(release);

    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("refuses to release a parcel whose notes are ready, even if the cart still waits", async () => {
    mocks.parcels = [
      {
        shipmentId: SHIPMENT_ID,
        orderId: ORDER_ID,
        resellerNoteSource: "uploaded",
        remessaAuthorized: true,
        labelReleased: false,
      },
      {
        shipmentId: "other-parcel",
        orderId: "order-b",
        resellerNoteSource: null,
        remessaAuthorized: false,
        labelReleased: false,
      },
    ];

    await expect(releaseStaffOnBehalfLabel(release)).rejects.toThrow(/não há o que liberar/);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
