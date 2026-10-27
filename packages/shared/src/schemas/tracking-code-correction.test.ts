import { describe, expect, it } from "vitest";
import { isTrackingCodeCorrection, trackingCodeCorrectionNote } from "./fulfillment.ts";

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
});
