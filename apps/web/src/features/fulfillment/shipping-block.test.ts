import { describe, expect, it } from "vitest";
import { saleStopNotice } from "./shipping-block";

describe("saleStopNotice", () => {
  it("tells the supplier not to ship a cancelled sale", () => {
    const notice = saleStopNotice("cancelled", "forwarded");

    expect(notice?.title).toBe("Venda cancelada: não envie");
    expect(notice?.description).toContain("passou para Encerrados");
  });

  it("asks the supplier to talk to the reseller about an unpaid sale", () => {
    expect(saleStopNotice("pending", "forwarded")?.title).toBe("Venda não liberada");
  });

  it("says nothing about a paid sale", () => {
    expect(saleStopNotice("paid", "forwarded")).toBeNull();
  });

  it("says a parcel that already left comes back as a return, not that it left the queue", () => {
    const notice = saleStopNotice("cancelled", "shipped");

    expect(notice?.title).toBe("Venda cancelada depois do envio");
    expect(notice?.description).toContain("volta para você como devolução");
  });

  it("says nothing about a cancelled sale whose parcel was already delivered", () => {
    expect(saleStopNotice("cancelled", "delivered")).toBeNull();
  });

  it("does not point a link-only supplier to a tab it does not have", () => {
    const notice = saleStopNotice("cancelled", "accepted", "link");

    expect(notice?.title).toBe("Venda cancelada: não envie");
    expect(notice?.description).not.toContain("Encerrados");
  });
});
