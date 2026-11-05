import { describe, expect, it } from "vitest";
import { channelLabel } from "./channel-labels";

describe("channelLabel", () => {
  it("names a channel the app sells on", () => {
    expect(channelLabel("mercado_livre")).toBe("Mercado Livre");
  });

  it("says a channel the app no longer sells on is discontinued", () => {
    expect(channelLabel("mock")).toBe("Canal descontinuado");
  });
});
