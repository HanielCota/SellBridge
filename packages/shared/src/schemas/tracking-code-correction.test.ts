import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isTrackingCodeCorrection,
  shipmentUpdateSchema,
  trackingCodeCorrectionNote,
} from "./fulfillment.ts";

describe("tracking code correction note", () => {
  it("names the old and the new code, then any note", () => {
    expect(trackingCodeCorrectionNote("AA1", "AA2", "")).toBe("Código corrigido de AA1 para AA2");
    expect(trackingCodeCorrectionNote("AA1", "AA2", " Digitei errado ")).toBe(
      "Código corrigido de AA1 para AA2 · Digitei errado",
    );
  });

  it("is told apart from a chat message", () => {
    expect(isTrackingCodeCorrection("Código corrigido de AA1 para AA2")).toBe(true);
    expect(isTrackingCodeCorrection("Saiu hoje cedo")).toBe(false);
  });

  // Only the server writes a correction step: a typed note with its wording would show in the
  // history as a code change that never happened.
  it("refuses a typed note that would read as a code correction", () => {
    const update = {
      shipmentId: randomUUID(),
      status: "shipped",
      carrier: "Correios",
      trackingCode: "QB000000001BR",
      note: "Código corrigido de QB000000001BR para QB999999999BR",
    };
    expect(shipmentUpdateSchema.safeParse(update).success).toBe(false);
    expect(shipmentUpdateSchema.safeParse({ ...update, note: "Saiu hoje cedo" }).success).toBe(
      true,
    );
  });
});
