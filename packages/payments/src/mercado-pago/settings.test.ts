import { describe, expect, test } from "vitest";
import { MERCADO_PAGO_SUPPLIER_PAYMENTS_ON, mercadoPagoSettingsFrom } from "./settings.ts";

const hosts = {
  MERCADO_PAGO_TEST_MODE: false,
  MERCADO_PAGO_API_URL: "https://api.mercadopago.com/",
  MERCADO_PAGO_AUTH_URL: "https://auth.mercadopago.com",
};
const allKeys = {
  ...hosts,
  MERCADO_PAGO_CLIENT_ID: "client",
  MERCADO_PAGO_CLIENT_SECRET: "secret",
  MERCADO_PAGO_WEBHOOK_SECRET: "signature",
};

describe("mercadoPagoSettingsFrom", () => {
  test("keeps supplier payments through Mercado Pago switched off", () => {
    expect(MERCADO_PAGO_SUPPLIER_PAYMENTS_ON).toBe(false);
  });

  test("is off even with the three keys set, while the switch is off", () => {
    const settings = mercadoPagoSettingsFrom(allKeys);

    expect(settings).toBeNull();
  });

  test("is off while any key is missing", () => {
    const settings = mercadoPagoSettingsFrom(
      { ...hosts, MERCADO_PAGO_CLIENT_ID: "client", MERCADO_PAGO_CLIENT_SECRET: "secret" },
      true,
    );

    expect(settings).toBeNull();
  });

  test("is on with the switch and the three keys, without a trailing slash on the hosts", () => {
    const settings = mercadoPagoSettingsFrom(allKeys, true);

    expect(settings?.apiUrl).toBe("https://api.mercadopago.com");
  });
});
