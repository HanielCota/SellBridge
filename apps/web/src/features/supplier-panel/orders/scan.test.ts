import { describe, expect, it } from "vitest";
import { type ScannedShipment, scanPlan } from "./scan";

const accepted: ScannedShipment = {
  status: "accepted",
  orderStatus: "paid",
  carrier: "Mercado Envios",
  trackingCode: "ML123",
};

describe("scanPlan", () => {
  it("brings an accepted parcel through picking to ready", () => {
    expect(scanPlan(accepted, "picking")).toEqual({ kind: "steps", steps: ["picking", "ready"] });
  });

  it("writes nothing for a parcel already ready when picking", () => {
    expect(scanPlan({ ...accepted, status: "ready" }, "picking")).toEqual({
      kind: "steps",
      steps: [],
    });
  });

  it("sends a ready parcel with the tracking it has", () => {
    expect(scanPlan({ ...accepted, status: "ready" }, "dispatch")).toEqual({
      kind: "steps",
      steps: ["shipped"],
    });
  });

  it("refuses to send a parcel without a tracking code", () => {
    expect(scanPlan({ ...accepted, trackingCode: null }, "dispatch")).toMatchObject({
      kind: "refused",
      reason: expect.stringMatching(/rastreio/),
    });
  });

  it("refuses a parcel not accepted yet", () => {
    expect(scanPlan({ ...accepted, status: "forwarded" }, "picking")).toMatchObject({
      kind: "refused",
      reason: expect.stringMatching(/Aceite/),
    });
  });

  it("refuses a sale not released for shipping", () => {
    expect(scanPlan({ ...accepted, orderStatus: "cancelled" }, "dispatch")).toMatchObject({
      kind: "refused",
      reason: expect.stringMatching(/liberação/),
    });
  });
});
