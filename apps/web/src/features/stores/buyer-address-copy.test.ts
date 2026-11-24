import { describe, expect, it } from "vitest";
import {
  type BuyerAddressNoticeInput,
  buyerAddressNoticeCopy,
  falseAlarmTicketSearch,
  recheckOutcomeCopy,
} from "./buyer-address-copy";

function check(overrides: Partial<BuyerAddressNoticeInput>): BuyerAddressNoticeInput {
  return {
    result: "supplier_address",
    supplierName: "BH Beauty Distribuidora",
    supplierPlace: { street: "Avenida Afonso Pena", number: "1500", zipCode: "30130110" },
    releasedAt: null,
    releaseNote: null,
    ...overrides,
  };
}

describe("buyerAddressNoticeCopy", () => {
  it("names the supplier and says new products wait", () => {
    const copy = buyerAddressNoticeCopy(check({}));

    expect(copy?.tone).toBe("danger");
    expect(copy?.paragraphs.join(" ")).toContain("vão chegar em BH Beauty Distribuidora");
    expect(copy?.paragraphs.join(" ")).toContain("não publica produtos novos");
  });

  it("shows the supplier's address the account buys at, so the reseller finds it", () => {
    const copy = buyerAddressNoticeCopy(check({}));

    expect(copy?.wrongAddress).toBe("Avenida Afonso Pena, 1500 · CEP 30130-110");
  });

  it("walks the reseller through the fix, ending at the check button", () => {
    const steps = buyerAddressNoticeCopy(check({}))?.steps ?? [];

    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain("Meus dados › Endereços");
    expect(steps[2]).toContain("BH Beauty Distribuidora só para envio e devolução");
    expect(steps.at(-1)).toContain("Já arrumei, conferir de novo");
  });

  it("lets a held reseller ask for a false alarm to be released", () => {
    expect(buyerAddressNoticeCopy(check({}))?.offersFalseAlarm).toBe(true);
    expect(buyerAddressNoticeCopy(check({ result: "shipping_address" }))?.offersFalseAlarm).toBe(
      false,
    );
  });

  it("still reads well when the supplier or its address is gone", () => {
    const copy = buyerAddressNoticeCopy(check({ supplierName: null, supplierPlace: null }));

    expect(copy?.paragraphs[0]).toContain("vão chegar no fornecedor");
    expect(copy?.wrongAddress).toBeNull();
  });

  it("tells a released store why it publishes, with nothing left to do", () => {
    const copy = buyerAddressNoticeCopy(
      check({ releasedAt: new Date("2026-11-23T12:00:00Z"), releaseNote: "Mora no mesmo prédio" }),
    );

    expect(copy?.tone).toBe("muted");
    expect(copy?.label).toBe("Liberada pela equipe");
    expect(copy?.paragraphs.join(" ")).toContain("Motivo: Mora no mesmo prédio");
    expect(copy?.actionLabel).toBeNull();
    expect(copy?.steps).toEqual([]);
  });

  it("only warns when the purchase address is the shipping one", () => {
    const copy = buyerAddressNoticeCopy(check({ result: "shipping_address", supplierName: null }));

    expect(copy?.tone).toBe("warning");
    expect(copy?.paragraphs.join(" ")).not.toContain("não publica");
    expect(copy?.steps.length).toBeGreaterThan(0);
  });

  it("says nothing for a fine address or a store never checked", () => {
    expect(buyerAddressNoticeCopy(check({ result: "ok" }))).toBeNull();
    expect(buyerAddressNoticeCopy(null)).toBeNull();
  });

  it("offers to check again quietly when the account could not be read", () => {
    expect(buyerAddressNoticeCopy(check({ result: "not_checked" }))?.tone).toBe("muted");
  });
});

describe("falseAlarmTicketSearch", () => {
  it("opens a ticket about the store, naming the supplier", () => {
    const search = falseAlarmTicketSearch("store-1", "BH Beauty Distribuidora");

    expect(search.loja).toBe("store-1");
    expect(search.texto).toContain("BH Beauty Distribuidora");
  });
});

describe("recheckOutcomeCopy", () => {
  it("celebrates a fixed address", () => {
    expect(recheckOutcomeCopy("ok")).toMatchObject({ kind: "success" });
  });

  it("insists while it is still the supplier's", () => {
    expect(recheckOutcomeCopy("supplier_address")).toMatchObject({
      kind: "error",
      title: "Ainda está no endereço do fornecedor",
    });
  });

  it("asks to try again later when the marketplace did not answer", () => {
    expect(recheckOutcomeCopy("not_checked")).toMatchObject({ kind: "warning" });
  });
});
