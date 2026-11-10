import { describe, expect, test } from "vitest";
import {
  mercadoPagoOutcomeSearch,
  mercadoPagoSettingsFrom,
  paymentAccountLinkRefusal,
  paymentAccountOwnerRefusal,
} from "./mercado-pago-connection.ts";

const SUPPLIER_ID = "5f0c9a3e-6a1f-4d7e-9a43-8b2d1c3e4f50";
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

describe("paymentAccountLinkRefusal", () => {
  test("lets a member of the supplier link its account", () => {
    expect(
      paymentAccountLinkRefusal({ supplierIds: [SUPPLIER_ID], impersonatedBy: null }, SUPPLIER_ID),
    ).toBeNull();
  });

  test("refuses another supplier's account", () => {
    expect(paymentAccountLinkRefusal({ supplierIds: [], impersonatedBy: null }, SUPPLIER_ID)).toBe(
      "sem_permissao",
    );
  });

  test("refuses during a team visit, even for the supplier's own account", () => {
    expect(
      paymentAccountLinkRefusal(
        { supplierIds: [SUPPLIER_ID], impersonatedBy: "staff-1" },
        SUPPLIER_ID,
      ),
    ).toBe("visita");
  });
});

describe("paymentAccountOwnerRefusal", () => {
  test("lets the supplier unlink its account", () => {
    expect(paymentAccountOwnerRefusal({ viewerKind: "supplier", impersonatedBy: null })).toBeNull();
  });

  test("refuses the team on its own", () => {
    expect(paymentAccountOwnerRefusal({ viewerKind: "team", impersonatedBy: null })).not.toBeNull();
  });

  test("refuses a team visit", () => {
    expect(
      paymentAccountOwnerRefusal({ viewerKind: "supplier", impersonatedBy: "staff-1" }),
    ).not.toBeNull();
  });
});

describe("mercadoPagoOutcomeSearch", () => {
  test("keeps a known outcome", () => {
    expect(mercadoPagoOutcomeSearch({ mercadopago: "ligada" })).toEqual({ mercadopago: "ligada" });
  });

  test("drops free text", () => {
    expect(mercadoPagoOutcomeSearch({ mercadopago: "Clique aqui" })).toEqual({});
  });
});
