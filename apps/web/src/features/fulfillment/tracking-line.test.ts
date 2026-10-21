import { describe, expect, it } from "vitest";
import { trackingLine } from "./tracking-line";

describe("trackingLine", () => {
  it("joins carrier and tracking code", () => {
    expect(trackingLine("Correios", "BR123456789BR")).toBe("Correios · BR123456789BR");
  });

  it("joins carrier and tracking code without a dangling separator", () => {
    expect(trackingLine(null, "BR123456789BR")).toBe("BR123456789BR");
    expect(trackingLine(" ", "BR123456789BR")).toBe("BR123456789BR");
  });
});
