import { describe, expect, it } from "vitest";
import { recentSalesText } from "./product-heat-text";

describe("recentSalesText", () => {
  it("says nothing with no sale, the tag already does", () => {
    expect(recentSalesText(0)).toBeNull();
  });

  it("uses the singular for one sale", () => {
    expect(recentSalesText(1)).toBe("1 venda em 30 dias");
  });

  it("uses the plural and the Brazilian thousands mark", () => {
    expect(recentSalesText(1_250)).toBe("1.250 vendas em 30 dias");
  });
});
