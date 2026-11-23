import { describe, expect, it } from "vitest";
import {
  allocateInstallments,
  defaultResellerBlingSettings,
  guessPaymentMethods,
  paymentMethodFor,
  paymentSlotOf,
  resellerBlingSettingsSchema,
  resellerSaleCfop,
} from "./reseller-bling.ts";

describe("resellerSaleCfop", () => {
  it("uses the in-state CFOP when the reseller and the buyer share the state", () => {
    const settings = defaultResellerBlingSettings();

    const cfop = resellerSaleCfop(settings, { resellerState: "sp", buyerState: "SP" });

    expect(cfop).toBe("5120");
  });

  it("uses the out-of-state CFOP otherwise", () => {
    const settings = defaultResellerBlingSettings();

    const cfop = resellerSaleCfop(settings, { resellerState: "MG", buyerState: "SP" });

    expect(cfop).toBe("6120");
  });
});

describe("resellerBlingSettingsSchema", () => {
  it("keeps the CNPJ digits only", () => {
    const parsed = resellerBlingSettingsSchema.parse({
      ...defaultResellerBlingSettings(),
      intermediaryCnpj: "03.007.331/0001-41",
    });

    expect(parsed.intermediaryCnpj).toBe("03007331000141");
  });

  it("refuses a CFOP that is not 4 numbers, saying which example to follow", () => {
    const result = resellerBlingSettingsSchema.safeParse({
      ...defaultResellerBlingSettings(),
      cfopOutOfState: "612",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Use um CFOP com 4 números, como 6120");
  });
});

describe("paymentSlotOf", () => {
  it("maps Mercado Livre's payments to their slots", () => {
    expect(paymentSlotOf({ type: "bank_transfer", methodId: "pix" })).toBe("pix");
    expect(paymentSlotOf({ type: "credit_card", methodId: "master" })).toBe("credit_mastercard");
    expect(paymentSlotOf({ type: "debit_card", methodId: "debelo" })).toBe("debit_elo");
    expect(paymentSlotOf({ type: "ticket", methodId: "bolbradesco" })).toBe("boleto");
    expect(paymentSlotOf({ type: "account_money", methodId: "account_money" })).toBe("wallet");
  });

  it("returns null for a card brand it does not know", () => {
    expect(paymentSlotOf({ type: "credit_card", methodId: "naranja" })).toBeNull();
  });
});

describe("guessPaymentMethods", () => {
  it("picks the first method of each slot by type and card brand", () => {
    const guessed = guessPaymentMethods([
      { id: 10, name: "Pix", type: 17, cardBrand: null },
      { id: 11, name: "Pix QR", type: 20, cardBrand: null },
      { id: 12, name: "Crédito Visa", type: 3, cardBrand: 1 },
      { id: 13, name: "Débito Master", type: 4, cardBrand: 2 },
      { id: 14, name: "Dinheiro", type: 1, cardBrand: null },
    ]);

    expect(guessed).toEqual({ pix: 10, credit_visa: 12, debit_mastercard: 13 });
  });
});

describe("paymentMethodFor", () => {
  it("returns the method chosen for the payment's slot", () => {
    const settings = { paymentMethods: { credit_visa: 12 } };

    const found = paymentMethodFor(settings, { type: "credit_card", methodId: "visa" });

    expect(found).toEqual({ methodId: 12, slot: "credit_visa", problem: null });
  });

  it("says which method to create when the slot has none", () => {
    const found = paymentMethodFor(
      { paymentMethods: {} },
      { type: "debit_card", methodId: "debvisa" },
    );

    expect(found.problem).toBe(
      'Falta a forma de pagamento "Cartão de débito Visa". Crie no seu Bling, escolha em Integrações › Bling e toque em Tentar de novo no pedido.',
    );
  });

  it("says to send the XML when the payment kind is not mapped", () => {
    const found = paymentMethodFor(
      { paymentMethods: {} },
      { type: "digital_currency", methodId: "x" },
    );

    expect(found.problem).toMatch(/envie o XML/);
  });
});

describe("allocateInstallments", () => {
  it("gives the whole note to a single payment", () => {
    expect(allocateInstallments(9_990, [{ amountCents: 12_490 }])).toEqual([9_990]);
  });

  it("splits by what each payment paid and leaves the rounding on the last", () => {
    expect(allocateInstallments(1_000, [{ amountCents: 1 }, { amountCents: 2 }])).toEqual([
      333, 667,
    ]);
  });

  it("returns nothing for an order without payments", () => {
    expect(allocateInstallments(1_000, [])).toEqual([]);
  });

  it("refuses a negative total", () => {
    expect(() => allocateInstallments(-1, [{ amountCents: 1 }])).toThrow(RangeError);
  });
});
