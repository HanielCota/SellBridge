import { describe, expect, it } from "vitest";
import {
  type AccountAddress,
  blocksPublishing,
  buyerAddressReleaseNoteSchema,
  judgeBuyerAddress,
  keepsRelease,
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
  const releasedAt = new Date("2026-11-23T12:00:00Z");

  it("holds publications back only for a supplier's address", () => {
    expect(blocksPublishing({ result: "supplier_address", releasedAt: null })).toBe(true);
    expect(blocksPublishing({ result: "shipping_address", releasedAt: null })).toBe(false);
    expect(blocksPublishing({ result: "no_buying_address", releasedAt: null })).toBe(false);
    expect(blocksPublishing({ result: "not_checked", releasedAt: null })).toBe(false);
    expect(blocksPublishing({ result: "ok", releasedAt: null })).toBe(false);
    expect(blocksPublishing(null)).toBe(false);
  });

  it("lets a store the team released as a false alarm publish", () => {
    expect(blocksPublishing({ result: "supplier_address", releasedAt })).toBe(false);
  });
});

describe("keepsRelease", () => {
  const releasedAt = new Date("2026-11-23T12:00:00Z");
  const released = { result: "supplier_address" as const, supplierId: "supplier-1", releasedAt };

  it("keeps the release while the account buys at the same supplier's address", () => {
    const verdict = { result: "supplier_address" as const, supplierId: "supplier-1" };

    expect(keepsRelease(released, verdict)).toBe(true);
  });

  it("drops the release when the account matches another supplier", () => {
    const verdict = { result: "supplier_address" as const, supplierId: "supplier-2" };

    expect(keepsRelease(released, verdict)).toBe(false);
  });

  it("drops the release once the address is fixed, so going back holds the store again", () => {
    expect(keepsRelease(released, { result: "ok" })).toBe(false);
  });

  it("never releases a store that was not released", () => {
    const verdict = { result: "supplier_address" as const, supplierId: "supplier-1" };

    expect(keepsRelease({ ...released, releasedAt: null }, verdict)).toBe(false);
  });
});

describe("buyerAddressReleaseNoteSchema", () => {
  it("asks why when the note is blank", () => {
    expect(buyerAddressReleaseNoteSchema.safeParse("   ").success).toBe(false);
  });

  it("accepts a short reason, trimmed", () => {
    expect(buyerAddressReleaseNoteSchema.parse("  Mora no mesmo prédio  ")).toBe(
      "Mora no mesmo prédio",
    );
  });

  it("refuses a note past the limit", () => {
    expect(buyerAddressReleaseNoteSchema.safeParse("a".repeat(301)).success).toBe(false);
  });
});
