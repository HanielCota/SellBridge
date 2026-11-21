import { describe, expect, it } from "vitest";
import { saleStopNotice } from "./shipping-block";

describe("saleStopNotice", () => {
  it("tells the supplier not to ship a cancelled sale", () => {
    const notice = saleStopNotice("cancelled");

    expect(notice?.title).toBe("Venda cancelada: não envie");
    expect(notice?.description).toContain("passou para Encerrados");
  });

  it("asks the supplier to talk to the reseller about an unpaid sale", () => {
    expect(saleStopNotice("pending")?.title).toBe("Venda não liberada");
  });

  it("says nothing about a paid sale", () => {
    expect(saleStopNotice("paid")).toBeNull();
  });
});
