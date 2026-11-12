import { describe, expect, it } from "vitest";
import { storeAfterResellerChange, storesOfReseller } from "./reseller-stores";

const stores = [
  { id: "store-a1", name: "Loja A1", resellerId: "reseller-a" },
  { id: "store-a2", name: "Loja A2", resellerId: "reseller-a" },
  { id: "store-b1", name: "Loja B1", resellerId: "reseller-b" },
];

describe("storesOfReseller", () => {
  it("offers every store while no reseller is chosen", () => {
    expect(storesOfReseller(stores, undefined).map((store) => store.id)).toEqual([
      "store-a1",
      "store-a2",
      "store-b1",
    ]);
  });

  it("offers only the chosen reseller's stores", () => {
    expect(storesOfReseller(stores, "reseller-b").map((store) => store.id)).toEqual(["store-b1"]);
  });

  it("offers nothing for a reseller with no stores listed", () => {
    expect(storesOfReseller(stores, "reseller-z")).toEqual([]);
  });
});

describe("storeAfterResellerChange", () => {
  it("keeps the store when it belongs to the new reseller", () => {
    expect(storeAfterResellerChange(stores, "store-a2", "reseller-a")).toBe("store-a2");
  });

  it("clears the store when it belongs to another reseller", () => {
    expect(storeAfterResellerChange(stores, "store-a2", "reseller-b")).toBeUndefined();
  });

  it("keeps the store when the reseller filter is cleared", () => {
    expect(storeAfterResellerChange(stores, "store-b1", undefined)).toBe("store-b1");
  });
});
