import { describe, expect, it } from "vitest";
import { bulkPublishHeading, bulkPublishOutcome, skippedDetails } from "./bulk-publish-outcome";

const none = { published: 0, failed: 0, pending: 0, skipped: [] };

describe("bulkPublishOutcome", () => {
  it("says how many listings went live, failed, are still going and stayed out", () => {
    expect(
      bulkPublishOutcome({
        published: 3,
        failed: 1,
        pending: 2,
        skipped: [
          { productId: "a", title: "Garrafa", reason: "already_published" },
          { productId: "b", title: "Copo", reason: "out_of_stock" },
        ],
      }),
    ).toEqual([
      { key: "published", label: "3 anúncios no ar", tone: "positive" },
      { key: "failed", label: "1 anúncio com falha", tone: "negative" },
      { key: "pending", label: "2 anúncios ainda publicando", tone: "neutral" },
      { key: "skipped", label: "2 produtos fora: 1 já publicado, 1 sem estoque", tone: "neutral" },
    ]);
  });

  it("leaves out what did not happen", () => {
    expect(bulkPublishOutcome({ ...none, published: 1 })).toEqual([
      { key: "published", label: "1 anúncio no ar", tone: "positive" },
    ]);
  });
});

describe("bulkPublishHeading", () => {
  it("follows the batch from running to its honest end", () => {
    expect(bulkPublishHeading({ ...none, published: 1, pending: 1 })).toBe("Publicando anúncios");
    expect(bulkPublishHeading({ ...none, published: 2 })).toBe("Tudo no ar");
    expect(bulkPublishHeading({ ...none, published: 1, failed: 1 })).toBe("Concluída com falhas");
    expect(bulkPublishHeading({ ...none, failed: 2 })).toBe("Nenhum anúncio foi ao ar");
  });
});

describe("skippedDetails", () => {
  it("names each product left out with its reason, a few at a time", () => {
    const skipped = ["A", "B", "C", "D", "E"].map((title) => ({
      productId: title,
      title,
      reason: "out_of_stock" as const,
    }));
    expect(skippedDetails(skipped, 3)).toEqual({
      shown: [
        { productId: "A", text: "A · sem estoque" },
        { productId: "B", text: "B · sem estoque" },
        { productId: "C", text: "C · sem estoque" },
      ],
      hidden: 2,
    });
  });

  it("names a product that left the catalog without a title", () => {
    expect(
      skippedDetails([{ productId: "x", title: null, reason: "unavailable" }], 3).shown,
    ).toEqual([{ productId: "x", text: "Produto · fora do catálogo" }]);
  });
});
