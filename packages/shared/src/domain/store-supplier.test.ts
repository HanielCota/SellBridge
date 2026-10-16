import { describe, expect, it } from "vitest";
import { storeSupplierRefusal, storeSupplierRefusalMessage } from "./store-supplier.ts";

describe("storeSupplierRefusal", () => {
  it("accepts a product of the shop's supplier", () => {
    expect(storeSupplierRefusal("supplier-a", "supplier-a")).toBeNull();
  });

  it("refuses a product of another supplier", () => {
    expect(storeSupplierRefusal("supplier-a", "supplier-b")).toBe("other_supplier");
  });

  it("refuses any product while the shop's supplier is pending", () => {
    expect(storeSupplierRefusal(null, "supplier-a")).toBe("supplier_pending");
  });

  it("tells the seller what to do for each refusal", () => {
    expect(storeSupplierRefusalMessage("supplier_pending")).toMatch(/Escolha o fornecedor/);
    expect(storeSupplierRefusalMessage("other_supplier")).toMatch(/outro fornecedor/);
  });
});
