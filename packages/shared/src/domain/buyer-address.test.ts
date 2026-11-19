import { describe, expect, it } from "vitest";
import {
  type AccountAddress,
  blocksPublishing,
  judgeBuyerAddress,
  type SupplierPlace,
} from "./buyer-address.ts";

const supplier: SupplierPlace = {
  supplierId: "supplier-1",
  zipCode: "30130-110",
  street: "Avenida Afonso Pena",
  number: "1500",
};

function address(overrides: Partial<AccountAddress>): AccountAddress {
  return {
    zipCode: "01310100",
    street: "Rua Augusta",
    number: "200",
    types: [],
    ...overrides,
  };
}

const home = address({ types: ["buying"] });
const supplierShipping = address({
  zipCode: "30130110",
  street: "Av. Afonso Pena",
  number: "1500",
  types: ["selling", "shipping"],
});

describe("judgeBuyerAddress", () => {
  it("accepts a purchase address that is neither a supplier's nor the shipping one", () => {
    const verdict = judgeBuyerAddress([home, supplierShipping], [supplier]);

    expect(verdict).toEqual({ result: "ok" });
  });

  it("names the supplier whose address the account buys at", () => {
    const buyingAtSupplier = { ...supplierShipping, types: ["buying" as const] };

    const verdict = judgeBuyerAddress([buyingAtSupplier], [supplier]);

    expect(verdict).toEqual({ result: "supplier_address", supplierId: "supplier-1" });
  });

  it("matches the supplier however the street type, accents and CEP are written", () => {
    const buying = address({
      zipCode: "30.130-110",
      street: "AVENIDA AFONSO PENA",
      number: "Nº 1500",
      types: ["buying"],
    });
    const accented = { ...supplier, street: "Av. Afonso Pená" };

    const verdict = judgeBuyerAddress([buying], [accented]);

    expect(verdict).toEqual({ result: "supplier_address", supplierId: "supplier-1" });
  });

  it("checks every supplier of the store, not only the first", () => {
    const other: SupplierPlace = {
      supplierId: "supplier-2",
      zipCode: "01310100",
      street: "Rua Augusta",
      number: "200",
    };

    const verdict = judgeBuyerAddress([home], [supplier, other]);

    expect(verdict).toEqual({ result: "supplier_address", supplierId: "supplier-2" });
  });

  it("treats a different complement at the same number as the same door", () => {
    const buying = address({ ...supplierShipping, types: ["buying"] });
    const withComplement = { ...supplier, street: "Avenida Afonso Pena sala 2" };

    const verdict = judgeBuyerAddress([buying], [withComplement]);

    expect(verdict.result).toBe("supplier_address");
  });

  it("keeps a different number on the same street apart", () => {
    const neighbour = address({ ...supplierShipping, number: "1502", types: ["buying"] });

    const verdict = judgeBuyerAddress([neighbour], [supplier]);

    expect(verdict.result).not.toBe("supplier_address");
  });

  it("keeps another street in a town with a single CEP apart", () => {
    const sameTownCep = { ...supplier, zipCode: "39990000", street: "Rua Principal", number: "10" };
    const buying = address({
      zipCode: "39990000",
      street: "Rua das Palmeiras",
      number: "10",
      types: ["buying"],
    });

    const verdict = judgeBuyerAddress([buying], [sameTownCep]);

    expect(verdict).toEqual({ result: "ok" });
  });

  it("matches two addresses without a number only to each other", () => {
    const supplierWithoutNumber = { ...supplier, number: "S/N" };
    const buyingWithoutNumber = address({ ...supplierShipping, number: "s/n", types: ["buying"] });
    const buyingWithNumber = address({ ...supplierShipping, types: ["buying"] });

    const without = judgeBuyerAddress([buyingWithoutNumber], [supplierWithoutNumber]);
    const withNumber = judgeBuyerAddress([buyingWithNumber], [supplierWithoutNumber]);

    expect(without.result).toBe("supplier_address");
    expect(withNumber.result).not.toBe("supplier_address");
  });

  it("does not match a street named only by filler words to every street", () => {
    const streetR = { ...supplier, street: "Rua R" };
    const buying = address({ ...supplierShipping, street: "Rua S", types: ["buying"] });

    const verdict = judgeBuyerAddress([buying], [streetR]);

    expect(verdict.result).not.toBe("supplier_address");
  });

  it("warns when the purchase address is also the shipping address", () => {
    const both = address({ types: ["buying", "shipping"] });

    const verdict = judgeBuyerAddress([both], []);

    expect(verdict).toEqual({ result: "shipping_address" });
  });

  it("warns when a separate shipping address is at the purchase address", () => {
    const shipping = address({ street: "R. Augusta", types: ["selling"] });

    const verdict = judgeBuyerAddress([home, shipping], []);

    expect(verdict).toEqual({ result: "shipping_address" });
  });

  it("prefers the supplier's name over the shipping warning", () => {
    const both = address({ ...supplierShipping, types: ["buying", "shipping"] });

    const verdict = judgeBuyerAddress([both], [supplier]);

    expect(verdict.result).toBe("supplier_address");
  });

  it("says so when the account marks no purchase address", () => {
    const verdict = judgeBuyerAddress([supplierShipping], [supplier]);

    expect(verdict).toEqual({ result: "no_buying_address" });
  });

  it("says so when the account has no address at all", () => {
    const verdict = judgeBuyerAddress([], [supplier]);

    expect(verdict).toEqual({ result: "no_buying_address" });
  });

  it("ignores a supplier whose address has no valid CEP", () => {
    const broken = { ...supplier, zipCode: "123" };
    const buying = address({ ...supplierShipping, types: ["buying"] });

    const verdict = judgeBuyerAddress([buying], [broken]);

    expect(verdict).toEqual({ result: "ok" });
  });

  it("ignores a purchase address with missing parts", () => {
    const incomplete = address({ zipCode: null, types: ["buying"] });

    const verdict = judgeBuyerAddress([incomplete], [supplier]);

    expect(verdict).toEqual({ result: "ok" });
  });
});

describe("blocksPublishing", () => {
  it("holds publications back only for a supplier's address", () => {
    expect(blocksPublishing("supplier_address")).toBe(true);
    expect(blocksPublishing("shipping_address")).toBe(false);
    expect(blocksPublishing("no_buying_address")).toBe(false);
    expect(blocksPublishing("not_checked")).toBe(false);
    expect(blocksPublishing("ok")).toBe(false);
    expect(blocksPublishing(null)).toBe(false);
  });
});
