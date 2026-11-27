import type { ShopeePickupChoice } from "@sellbridge/marketplaces";
import { describe, expect, it } from "vitest";
import {
  pickupAddressLines,
  type SupplierAddress,
  supplierAddressLines,
  supplierPickup,
} from "./shopee-pickup";

const SUPPLIER: SupplierAddress = {
  cep: "35500-024",
  street: "Rua das Fábricas",
  number: "250",
  complement: "Galpão 2",
  neighborhood: "Centro",
  city: "Divinópolis",
  state: "MG",
};

function choice(overrides: Partial<ShopeePickupChoice> = {}): ShopeePickupChoice {
  return {
    addressId: 2_002,
    flags: ["pickup_address"],
    address: "Rua das Fábricas, 250",
    district: "Centro",
    city: "Divinópolis",
    state: "MG",
    zipcode: "35500024",
    pickupTimeId: "slot-b",
    pickupDate: undefined,
    timeText: undefined,
    ...overrides,
  };
}

const SHOP_DEFAULT = choice({
  addressId: 1_001,
  flags: ["default_address"],
  address: "Avenida Paulista, 1000",
  zipcode: "01310-100",
});

describe("supplierPickup", () => {
  it("picks the shop's address with the supplier's CEP and number, not the default one", () => {
    const result = supplierPickup([SHOP_DEFAULT, choice()], SUPPLIER);

    expect(result).toEqual({ kind: "match", choice: choice() });
  });

  it("finds none when the shop only has the supplier's CEP with another number", () => {
    const result = supplierPickup(
      [SHOP_DEFAULT, choice({ address: "Rua das Fábricas, 25" })],
      SUPPLIER,
    );

    expect(result).toEqual({ kind: "missing" });
  });

  it("matches an address without a number by its CEP", () => {
    const result = supplierPickup([choice({ address: "Rua das Fábricas" })], {
      ...SUPPLIER,
      number: "S/N",
    });

    expect(result.kind).toBe("match");
  });

  it("prefers the one marked as pickup address when two are the supplier's", () => {
    const returns = choice({ addressId: 3_003, flags: ["return_address"] });

    const result = supplierPickup([returns, choice()], SUPPLIER);

    expect(result).toEqual({ kind: "match", choice: choice() });
  });

  it("reports two equal pickup addresses instead of guessing", () => {
    const result = supplierPickup([choice({ addressId: 3_003 }), choice()], SUPPLIER);

    expect(result).toEqual({ kind: "ambiguous" });
  });
});

describe("address lines", () => {
  it("writes the supplier's address as it is typed into Shopee", () => {
    expect(supplierAddressLines(SUPPLIER)).toEqual([
      "Rua das Fábricas, 250 - Galpão 2",
      "Centro, Divinópolis - MG",
      "CEP 35500-024",
    ]);
  });

  it("writes Shopee's pickup address without empty parts", () => {
    expect(pickupAddressLines(choice({ district: "" }))).toEqual([
      "Rua das Fábricas, 250",
      "Divinópolis - MG",
      "CEP 35500-024",
    ]);
  });
});
