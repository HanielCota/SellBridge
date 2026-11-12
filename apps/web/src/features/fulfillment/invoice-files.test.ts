import { describe, expect, it } from "vitest";
import { assertInvoiceFileAccess } from "./invoice-files";

const FILES = {
  shipmentId: "6f5a3a8e-61c1-4c8a-9a3a-2b0d4c1e9f10",
  orderId: "0c6b7e2a-0f1e-4a4b-8d7e-3f2a1b0c9d8e",
  tenantId: "tenant-reseller",
  supplierId: "a1f0c2d3-4b5e-4f60-8a71-92b3c4d5e6f7",
  number: "1234",
  accessKey: "31261111222333000181550010000012341000012345",
};

describe("assertInvoiceFileAccess", () => {
  it("lets the reseller of the order download the note", () => {
    expect(() =>
      assertInvoiceFileAccess(FILES, FILES.orderId, {
        kind: "reseller",
        tenantId: "tenant-reseller",
      }),
    ).not.toThrow();
  });

  it("hides the note from another reseller", () => {
    expect(() =>
      assertInvoiceFileAccess(FILES, FILES.orderId, { kind: "reseller", tenantId: "someone" }),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("hides the note when it is asked for under another order", () => {
    expect(() =>
      assertInvoiceFileAccess(FILES, "9d8e7f6a-5b4c-4d3e-8f2a-1b0c9d8e7f6a", {
        kind: "reseller",
        tenantId: "tenant-reseller",
      }),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("lets the supplier who issued it download from the panel", () => {
    expect(() =>
      assertInvoiceFileAccess(FILES, FILES.orderId, {
        kind: "supplier",
        viewer: { kind: "supplier", supplierId: FILES.supplierId },
        supplierId: FILES.supplierId,
      }),
    ).not.toThrow();
  });

  it("refuses a supplier panel asking in another supplier's name", () => {
    expect(() =>
      assertInvoiceFileAccess(FILES, FILES.orderId, {
        kind: "supplier",
        viewer: { kind: "supplier", supplierId: "b2c3d4e5-f607-4819-8a2b-3c4d5e6f7a8b" },
        supplierId: FILES.supplierId,
      }),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("hides another supplier's note from a supplier", () => {
    const otherSupplier = "b2c3d4e5-f607-4819-8a2b-3c4d5e6f7a8b";

    expect(() =>
      assertInvoiceFileAccess(FILES, FILES.orderId, {
        kind: "supplier",
        viewer: { kind: "supplier", supplierId: otherSupplier },
        supplierId: otherSupplier,
      }),
    ).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
  });

  it("refuses a reseller profile asking as a supplier", () => {
    expect(() =>
      assertInvoiceFileAccess(FILES, FILES.orderId, {
        kind: "supplier",
        viewer: { kind: "seller" },
        supplierId: FILES.supplierId,
      }),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });
});
