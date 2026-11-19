import { describe, expect, it } from "vitest";
import { supplierSituation } from "./supplier-situation";

describe("supplierSituation", () => {
  it("says a pending supplier is under review even while switched on", () => {
    expect(supplierSituation({ active: true, approvalStatus: "pending" })).toEqual({
      tone: "warning",
      label: "Em análise",
    });
  });

  it("says a refused supplier is refused", () => {
    expect(supplierSituation({ active: true, approvalStatus: "refused" }).label).toBe("Recusado");
  });

  it("follows the on/off switch once approved", () => {
    expect(supplierSituation({ active: true, approvalStatus: "approved" }).label).toBe("Ativo");
    expect(supplierSituation({ active: false, approvalStatus: "approved" }).label).toBe(
      "Desativado",
    );
  });
});
