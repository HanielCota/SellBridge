import { describe, expect, it } from "vitest";
import { invoiceFileLink } from "./invoice-file-link";

describe("invoiceFileLink", () => {
  it("points the reseller at the parcel's file under the order", () => {
    expect(invoiceFileLink({ orderId: "o-1", shipmentId: "s-1", kind: "danfe" })).toBe(
      "/api/pedidos/o-1/nota-fiscal?envio=s-1&arquivo=danfe",
    );
  });

  it("names the supplier when the panel asks", () => {
    expect(
      invoiceFileLink({ orderId: "o-1", shipmentId: "s-1", kind: "xml", supplierId: "f-1" }),
    ).toBe("/api/pedidos/o-1/nota-fiscal?envio=s-1&arquivo=xml&fornecedor=f-1");
  });
});
