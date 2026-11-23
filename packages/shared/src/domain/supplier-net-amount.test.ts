import { describe, expect, test } from "vitest";
import {
  InvalidSupplierAmountError,
  supplierNetForOrder,
  supplierNetForOrders,
} from "./supplier-net-amount.ts";

describe("supplierNetForOrder", () => {
  test("takes 4% and the Pix fee from a R$ 100,00 order paid by Pix", () => {
    const split = supplierNetForOrder(10_000, "PIX");

    expect(split).toEqual({
      soldCents: 10_000,
      platformFeeCents: 400,
      asaasFeeCents: 199,
      netCents: 9401,
    });
  });

  test("takes 4% and 2,99% plus R$ 0,49 from a R$ 100,00 order paid by card", () => {
    const split = supplierNetForOrder(10_000, "CREDIT_CARD");

    expect(split.asaasFeeCents).toBe(348);
    expect(split.netCents).toBe(9252);
  });

  test("rounds each fee to the cent, half up", () => {
    const split = supplierNetForOrder(5_990, "CREDIT_CARD");

    expect(split.platformFeeCents).toBe(240);
    expect(split.asaasFeeCents).toBe(228);
    expect(split.netCents).toBe(5_522);
  });

  test("gives zero everywhere when nothing was sold", () => {
    const split = supplierNetForOrder(0, "PIX");

    expect(split).toEqual({ soldCents: 0, platformFeeCents: 0, asaasFeeCents: 0, netCents: 0 });
  });

  test("never leaves the supplier below zero on a price smaller than the fee", () => {
    const split = supplierNetForOrder(150, "PIX");

    expect(split.platformFeeCents).toBe(6);
    expect(split.asaasFeeCents).toBe(144);
    expect(split.netCents).toBe(0);
  });

  test("throws InvalidSupplierAmountError on a negative price", () => {
    expect(() => supplierNetForOrder(-1, "PIX")).toThrow(InvalidSupplierAmountError);
  });

  test("throws InvalidSupplierAmountError on a price that is not whole cents", () => {
    expect(() => supplierNetForOrder(10.5, "PIX")).toThrow(InvalidSupplierAmountError);
  });

  test("throws InvalidSupplierAmountError on a price that is not finite", () => {
    expect(() => supplierNetForOrder(Number.NaN, "PIX")).toThrow(InvalidSupplierAmountError);
  });
});

describe("supplierNetForOrders", () => {
  test("takes 4% of the total and one Pix fee per order", () => {
    const split = supplierNetForOrders(177_261, 31);

    expect(split.platformFeeCents).toBe(7_090);
    expect(split.asaasFeeCents).toBe(6_169);
    expect(split.netCents).toBe(164_002);
  });

  test("gives zero everywhere for a month without sales", () => {
    const split = supplierNetForOrders(0, 0);

    expect(split.netCents).toBe(0);
    expect(split.asaasFeeCents).toBe(0);
  });

  test("takes no Asaas fee when no order is counted", () => {
    const split = supplierNetForOrders(10_000, 0);

    expect(split.netCents).toBe(9_600);
  });

  test("throws InvalidSupplierAmountError on a negative order count", () => {
    expect(() => supplierNetForOrders(10_000, -1)).toThrow(InvalidSupplierAmountError);
  });

  test("throws InvalidSupplierAmountError on a fractional order count", () => {
    expect(() => supplierNetForOrders(10_000, 1.5)).toThrow(InvalidSupplierAmountError);
  });
});
