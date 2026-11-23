import { describe, expect, it } from "vitest";
import { canAddProducts } from "./can-add-products";

describe("canAddProducts", () => {
  it("lets an approved supplier add products", () => {
    expect(canAddProducts({ active: true, approvalStatus: "approved" })).toBe(true);
  });

  it("lets a supplier under review add products", () => {
    expect(canAddProducts({ active: true, approvalStatus: "pending" })).toBe(true);
  });

  it("hides adding products from a refused supplier", () => {
    expect(canAddProducts({ active: true, approvalStatus: "refused" })).toBe(false);
  });

  it("hides adding products from a supplier the team switched off", () => {
    expect(canAddProducts({ active: false, approvalStatus: null })).toBe(false);
  });
});
