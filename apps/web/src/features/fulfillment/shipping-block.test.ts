import { describe, expect, it } from "vitest";
import { blockedOrderNote, saleStopNotice } from "./shipping-block";

describe("saleStopNotice", () => {
  it("tells the supplier not to ship a cancelled sale", () => {
    const notice = saleStopNotice("cancelled", "forwarded");

    expect(notice?.title).toBe("Venda cancelada: não envie");
    expect(notice?.description).toContain("passou para Encerrados");
  });

  it("asks the supplier to talk to the reseller about an unpaid sale", () => {
    expect(saleStopNotice("pending", "forwarded")?.title).toBe("Venda não liberada");
  });

  it("keeps the order link's own words for an unpaid sale", () => {
    const notice = saleStopNotice("pending", "forwarded", "link");

    expect(notice?.title).toBe("Pedido sem liberação para envio");
    expect(notice?.description).toContain("Fale com o revendedor");
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

describe("blockedOrderNote", () => {
  it.each([
    ["cancelled", "Este pedido foi cancelado."],
    ["returned", "Este pedido foi devolvido."],
    ["pending", "Este pedido ainda não foi pago. Espere o pagamento para encaminhar."],
  ])("names the one reason a %s order cannot be forwarded", (status, note) => {
    expect(blockedOrderNote(status)).toBe(note);
  });
});
