import { describe, expect, it } from "vitest";
import {
  channelFeeSegments,
  channelSaleFees,
  type ChannelFeeContext,
  type FeeChannel,
  feeChannelOf,
  totalChannelFeeCents,
} from "./channel-fees.ts";
import { percentOfCents } from "./money.ts";

const lightItem: ChannelFeeContext = { mercadoLivreCommissionBasisPoints: 1_400, weightGrams: 300 };

describe("channelSaleFees on Mercado Livre", () => {
  it("charges the client's R$ 33,90 sale R$ 4,75 of commission and R$ 6,85 of shipping", () => {
    const fees = channelSaleFees("mercado_livre", 3_390, lightItem);

    expect(fees).toEqual({ commissionCents: 475, fixedFeeCents: 0, shippingCents: 685 });
    expect(3_390 - totalChannelFeeCents(fees)).toBe(2_230);
  });

  it("moves to the next shipping band at R$ 79,00", () => {
    expect(channelSaleFees("mercado_livre", 7_899, lightItem).shippingCents).toBe(815);
    expect(channelSaleFees("mercado_livre", 7_900, lightItem).shippingCents).toBe(1_295);
  });

  it("prices a heavier item on its weight band", () => {
    const heavier = { ...lightItem, weightGrams: 301 };

    expect(channelSaleFees("mercado_livre", 3_390, heavier).shippingCents).toBe(695);
  });

  it("caps the shipping at half the price under R$ 19", () => {
    expect(channelSaleFees("mercado_livre", 1_000, lightItem).shippingCents).toBe(500);
    expect(channelSaleFees("mercado_livre", 1_800, lightItem).shippingCents).toBe(565);
  });

  it("charges nothing on a zero price", () => {
    expect(totalChannelFeeCents(channelSaleFees("mercado_livre", 0, lightItem))).toBe(0);
  });
});

describe("channelSaleFees on TikTok Shop", () => {
  it("charges 10% + R$ 4,00 and 6% of shipping program under R$ 50", () => {
    expect(channelSaleFees("tiktok_shop", 3_390, lightItem)).toEqual({
      commissionCents: 339,
      fixedFeeCents: 400,
      shippingCents: 203,
    });
  });

  it("charges 6% + R$ 6,00 from R$ 50", () => {
    expect(channelSaleFees("tiktok_shop", 5_000, lightItem)).toEqual({
      commissionCents: 300,
      fixedFeeCents: 600,
      shippingCents: 300,
    });
  });

  it("caps the shipping program at R$ 50 per item", () => {
    expect(channelSaleFees("tiktok_shop", 100_000, lightItem).shippingCents).toBe(5_000);
  });
});

describe("channelSaleFees on Shopee", () => {
  it("charges 20% + R$ 4,50 up to R$ 79,99", () => {
    expect(channelSaleFees("shopee", 3_390, lightItem)).toEqual({
      commissionCents: 678,
      fixedFeeCents: 450,
      shippingCents: 0,
    });
  });

  it("charges half the price as the fixed part under R$ 9", () => {
    expect(channelSaleFees("shopee", 800, lightItem).fixedFeeCents).toBe(400);
  });

  it("charges 14% + R$ 16,00 from R$ 80", () => {
    expect(channelSaleFees("shopee", 8_000, lightItem)).toEqual({
      commissionCents: 1_120,
      fixedFeeCents: 1_600,
      shippingCents: 0,
    });
  });
});

describe("feeChannelOf", () => {
  it.each([
    ["mercado_livre", "mercado_livre"],
    ["mock", "mercado_livre"],
    ["tiktok_shop", "tiktok_shop"],
    ["shopee", "shopee"],
  ] as const)("charges a %s store as %s", (marketplaceId, channel) => {
    expect(feeChannelOf(marketplaceId)).toBe(channel);
  });
});

describe("channelFeeSegments", () => {
  const channels: readonly FeeChannel[] = ["mercado_livre", "tiktok_shop", "shopee"];
  const prices = [
    ...Array.from({ length: 4_000 }, (_, index) => index * 37 + 1),
    899,
    900,
    1_129,
    1_130,
    1_899,
    1_900,
    4_999,
    5_000,
    7_999,
    8_000,
    83_333,
    83_334,
  ];

  it.each(channels)("follows the real %s fees within the rounding slack", (channel) => {
    const segments = channelFeeSegments(channel, lightItem);

    for (const priceCents of prices) {
      const segment = segments.find(
        (candidate) => priceCents >= candidate.fromCents && priceCents <= candidate.toCents,
      );
      const exact = totalChannelFeeCents(channelSaleFees(channel, priceCents, lightItem));
      const linear =
        percentOfCents(priceCents, segment?.basisPoints ?? 0) + (segment?.fixedCents ?? 0);

      expect(segment).toBeDefined();
      expect(Math.abs(exact - linear)).toBeLessThanOrEqual(2);
    }
  });

  it.each(channels)("covers every %s price once, in order", (channel) => {
    const segments = channelFeeSegments(channel, lightItem);

    segments.forEach((segment, index) => {
      expect(segment.fromCents).toBe(index === 0 ? 0 : (segments[index - 1]?.toCents ?? 0) + 1);
    });
  });
});
