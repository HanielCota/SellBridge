import { describe, expect, it } from "vitest";
import { compareSupplierCoverage } from "./coverage-change";

const casa = { id: "1", name: "Casa Mineira", productCount: 40 };
const moda = { id: "2", name: "Moda BH", productCount: 25 };
const tech = { id: "3", name: "Tech Sul", productCount: 10 };

describe("compareSupplierCoverage", () => {
  it("lists suppliers gained and lost and the product balance", () => {
    expect(compareSupplierCoverage([casa, moda], [moda, tech])).toEqual({
      supplierCount: 2,
      productCount: 35,
      gained: ["Tech Sul"],
      lost: ["Casa Mineira"],
      productDelta: -30,
    });
  });

  it("reports no change for the same suppliers", () => {
    expect(compareSupplierCoverage([casa], [casa])).toMatchObject({
      gained: [],
      lost: [],
      productDelta: 0,
    });
  });

  it("treats a first region as gaining every supplier", () => {
    expect(compareSupplierCoverage([], [casa, moda])).toMatchObject({
      gained: ["Casa Mineira", "Moda BH"],
      productDelta: 65,
    });
  });
});
