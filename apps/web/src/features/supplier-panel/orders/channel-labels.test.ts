import { describe, expect, it } from "vitest";
import { channelLabel, channelSource } from "./channel-labels";

describe("channelLabel", () => {
  it("names a channel the app sells on", () => {
    expect(channelLabel("mercado_livre")).toBe("Mercado Livre");
  });

  it("says a channel the app no longer sells on is discontinued", () => {
    expect(channelLabel("mock")).toBe("Canal descontinuado");
  });
});

describe("channelSource", () => {
  it.each([
    ["mercado_livre", "do Mercado Livre"],
    ["shopee", "da Shopee"],
    ["tiktok_shop", "do TikTok Shop"],
  ])("says where %s data came from as %s", (marketplace, phrase) => {
    expect(channelSource(marketplace)).toBe(phrase);
  });

  it("falls back to the sales channel for one the app no longer sells on", () => {
    expect(channelSource("mock")).toBe("do canal de venda");
  });
});
