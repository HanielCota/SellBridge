import { describe, expect, it } from "vitest";
import { completenessLabel, completenessTier } from "./completeness-wording";

describe("completenessTier", () => {
  it("says a product on sale with missing data is still on sale", () => {
    const tier = completenessTier({ score: 47, blocking: 2, onSale: true });

    expect(tier).toBe("pending_on_sale");
    expect(completenessLabel(tier, 2)).toBe("À venda · 2 dados a completar");
  });

  it("keeps blocking a product not on sale yet", () => {
    const tier = completenessTier({ score: 47, blocking: 1, onSale: false });

    expect(completenessLabel(tier, 1)).toBe("1 impede publicar");
  });

  it("tells a complete product apart from one that can improve", () => {
    expect(completenessTier({ score: 100, blocking: 0, onSale: true })).toBe("complete");
    expect(completenessTier({ score: 80, blocking: 0, onSale: false })).toBe("improvable");
  });
});
