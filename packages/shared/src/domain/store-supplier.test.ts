import { describe, expect, it } from "vitest";
import {
  catalogSourceRefusal,
  storeSupplierRefusal,
  storeSupplierRefusalMessage,
} from "./store-supplier.ts";

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

// MVP (coordinator decision, 2026-10-22): resellers sell only suppliers' products.
describe("catalogSourceRefusal", () => {
  it("accepts a supplier's product", () => {
    expect(catalogSourceRefusal("supplier")).toBeNull();
  });

  // Review finding (function 1): the reseller reads this message, so it is plain language;
  // the received and expected values go to the log instead.
  it("refuses a reseller's own product in plain language", () => {
    const message = catalogSourceRefusal("seller");
    expect(message).toContain("só produtos de fornecedor");
    expect(message).not.toMatch(/recebido|esperado/i);
  });
});
