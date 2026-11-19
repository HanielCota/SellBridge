import { describe, expect, it } from "vitest";
import { countLabel } from "./count-label";

describe("countLabel", () => {
  // Regression: the supplier picker read "1 produtos" and the admin customers "1 pedidos".
  it("uses the singular for one", () => {
    expect(countLabel(1, "produto", "produtos")).toBe("1 produto");
  });

  it("uses the plural for zero and many, with the thousands dot", () => {
    expect(countLabel(0, "pedido", "pedidos")).toBe("0 pedidos");
    expect(countLabel(1200, "pedido", "pedidos")).toBe("1.200 pedidos");
  });
});
