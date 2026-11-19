import { describe, expect, it } from "vitest";
import { buyerAddressNoticeCopy, recheckOutcomeCopy } from "./buyer-address-copy";

describe("buyerAddressNoticeCopy", () => {
  it("names the supplier and says new products wait", () => {
    const copy = buyerAddressNoticeCopy("supplier_address", "BH Beauty Distribuidora");

    expect(copy?.tone).toBe("danger");
    expect(copy?.paragraphs.join(" ")).toContain("vão chegar em BH Beauty Distribuidora");
    expect(copy?.paragraphs.join(" ")).toContain("não publica produtos novos");
  });

  it("still reads well when the supplier was removed", () => {
    const copy = buyerAddressNoticeCopy("supplier_address", null);

    expect(copy?.paragraphs[0]).toContain("vão chegar no fornecedor");
  });

  it("only warns when the purchase address is the shipping one", () => {
    const copy = buyerAddressNoticeCopy("shipping_address", null);

    expect(copy?.tone).toBe("warning");
    expect(copy?.paragraphs.join(" ")).not.toContain("não publica");
  });

  it("says nothing for a fine address or a store never checked", () => {
    expect(buyerAddressNoticeCopy("ok", null)).toBeNull();
    expect(buyerAddressNoticeCopy(null, null)).toBeNull();
  });

  it("offers to check again quietly when the account could not be read", () => {
    expect(buyerAddressNoticeCopy("not_checked", null)?.tone).toBe("muted");
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
