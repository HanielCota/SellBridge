import { describe, expect, it } from "vitest";
import { orderItemsLabel } from "./order-items-label";

describe("order items label", () => {
  it("names the only item of the order", () => {
    expect(orderItemsLabel("Máscara capilar", 1)).toBe("Máscara capilar");
  });

  it("counts the other items after the first one", () => {
    expect(orderItemsLabel("Máscara capilar", 2)).toBe("Máscara capilar e mais 1 item");
    expect(orderItemsLabel("Máscara capilar", 4)).toBe("Máscara capilar e mais 3 itens");
  });

  it("names nothing for an order without items", () => {
    expect(orderItemsLabel(null, 0)).toBeNull();
    expect(orderItemsLabel("  ", 1)).toBeNull();
  });
});
