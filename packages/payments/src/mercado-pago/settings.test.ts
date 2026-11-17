import { describe, expect, test } from "vitest";
import { mercadoPagoSettingsFrom } from "./settings.ts";

const hosts = {
  MERCADO_PAGO_TEST_MODE: false,
  MERCADO_PAGO_API_URL: "https://api.mercadopago.com/",
  MERCADO_PAGO_AUTH_URL: "https://auth.mercadopago.com",
};

describe("mercadoPagoSettingsFrom", () => {
  test("is off while any key is missing", () => {
    const settings = mercadoPagoSettingsFrom({
      ...hosts,
      MERCADO_PAGO_CLIENT_ID: "client",
      MERCADO_PAGO_CLIENT_SECRET: "secret",
    });

    expect(settings).toBeNull();
  });

  test("is on with the three keys, without a trailing slash on the hosts", () => {
    const settings = mercadoPagoSettingsFrom({
      ...hosts,
      MERCADO_PAGO_CLIENT_ID: "client",
      MERCADO_PAGO_CLIENT_SECRET: "secret",
      MERCADO_PAGO_WEBHOOK_SECRET: "signature",
    });

    expect(settings?.apiUrl).toBe("https://api.mercadopago.com");
  });
});
