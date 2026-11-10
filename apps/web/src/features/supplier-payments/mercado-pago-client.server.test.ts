import { describe, expect, test } from "vitest";
import { isMercadoPagoCheckoutUrl } from "./mercado-pago-client.server";
import type { MercadoPagoSettings } from "./mercado-pago-connection";

const settings: MercadoPagoSettings = {
  clientId: "client",
  clientSecret: "secret",
  webhookSecret: "signature",
  testMode: false,
  apiUrl: "https://api.mercadopago.com",
  authUrl: "https://auth.mercadopago.com",
};

describe("isMercadoPagoCheckoutUrl", () => {
  test("accepts Mercado Pago's checkout", () => {
    const address = "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1";

    expect(isMercadoPagoCheckoutUrl(address, settings)).toBe(true);
  });

  test("refuses a host that only starts like Mercado Pago's", () => {
    expect(isMercadoPagoCheckoutUrl("https://mercadopago.com.br.example.com/pay", settings)).toBe(
      false,
    );
  });

  test("refuses a non-HTTPS address", () => {
    expect(isMercadoPagoCheckoutUrl("http://www.mercadopago.com.br/checkout", settings)).toBe(
      false,
    );
  });

  test("accepts the browser tests' stand-in on the API's own host", () => {
    const local = { ...settings, apiUrl: "http://localhost:3500/__e2e/mercado-pago/api" };
    const address = "http://localhost:3500/__e2e/mercado-pago/checkout?pref=1";

    expect(isMercadoPagoCheckoutUrl(address, local)).toBe(true);
  });
});
