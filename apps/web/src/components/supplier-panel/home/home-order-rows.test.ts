import { describe, expect, it } from "vitest";
import { orderTitle, unitsOf } from "./home-order-rows";

const vase = { title: "Vaso cerâmica P", sku: "VAS-P", quantity: 2 };
const bowl = { title: "Bowl 500 ml", sku: "BOW-5", quantity: 4 };

describe("orderTitle", () => {
  it("names the first item and counts the others", () => {
    expect(orderTitle([vase])).toBe("Vaso cerâmica P");
    expect(orderTitle([vase, bowl])).toBe("Vaso cerâmica P e mais 1 item");
    expect(orderTitle([vase, bowl, bowl])).toBe("Vaso cerâmica P e mais 2 itens");
    expect(orderTitle([])).toBe("Sem itens");
  });
});

describe("unitsOf", () => {
  it("adds the units of every item of the parcel", () => {
    expect(unitsOf([vase, bowl])).toBe(6);
    expect(unitsOf([])).toBe(0);
  });
});
