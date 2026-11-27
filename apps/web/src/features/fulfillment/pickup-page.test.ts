import type { ShopeePickupChoice } from "@sellbridge/marketplaces";
import { describe, expect, it } from "vitest";
import { pickupConfirmationPage, pickupMissingPage } from "./pickup-page";

const CHOICE: ShopeePickupChoice = {
  addressId: 2_002,
  flags: ["pickup_address"],
  address: "Rua das Fábricas, 250",
  district: "Centro",
  city: "Divinópolis",
  state: "MG",
  zipcode: "35500-024",
  pickupTimeId: "slot-b",
  pickupDate: new Date("2026-11-28T12:00:00Z"),
  timeText: "9h às 12h",
};

function confirmation(form = new URLSearchParams({ token: "abc", formato: "pdf" })) {
  return pickupConfirmationPage({
    externalOrderId: "261126E81SYYKE",
    shopName: "Loja da Pri",
    choice: CHOICE,
    form,
    action: "/api/pedidos/6f1c/etiqueta?perfil=1",
  });
}

describe("pickupConfirmationPage", () => {
  it("shows where and when the carrier picks the parcel up, with one confirm button", () => {
    const page = confirmation();

    expect(page).toContain("A coleta será em:");
    expect(page).toContain("Rua das Fábricas, 250");
    expect(page).toContain("28/11/2026 · 9h às 12h");
    expect(page.match(/<button/g)).toHaveLength(1);
    expect(page).toContain("Confirmar coleta e gerar etiqueta");
  });

  it("sends back the label request it confirms, with the chosen address and slot", () => {
    const page = confirmation();

    expect(page).toContain('action="/api/pedidos/6f1c/etiqueta?perfil=1"');
    expect(page).toContain('name="token" value="abc"');
    expect(page).toContain('name="formato" value="pdf"');
    expect(page).toContain('name="coleta" value="2002"');
    expect(page).toContain('name="horario" value="slot-b"');
  });

  it("does not repeat an older confirmation sent with the request", () => {
    const page = confirmation(new URLSearchParams({ token: "abc", coleta: "1", horario: "old" }));

    expect(page).not.toContain('name="coleta" value="1"');
    expect(page).not.toContain('value="old"');
  });

  it("escapes what came from the form and from Shopee", () => {
    const page = confirmation(new URLSearchParams({ token: '"><script>alert(1)</script>' }));

    expect(page).not.toContain("<script>alert(1)");
    expect(page).toContain("&quot;&gt;&lt;script&gt;");
  });
});

describe("pickupMissingPage", () => {
  it("names the shop and the address it must register on Shopee", () => {
    const page = pickupMissingPage({
      externalOrderId: "261126E81SYYKE",
      shopName: "Loja da Pri",
      supplierAddress: ["Rua das Fábricas, 250", "Centro, Divinópolis - MG", "CEP 35500-024"],
      ambiguous: false,
    });

    expect(page).toContain("Falta o endereço de coleta na Shopee");
    expect(page).toContain("a loja Loja da Pri ainda não tem esse endereço");
    expect(page).toContain("CEP 35500-024");
    expect(page).toContain("Nenhuma coleta foi agendada.");
  });
});
