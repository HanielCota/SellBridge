import { describe, expect, test } from "vitest";
import { receivingEmphasis } from "./receiving-emphasis";

describe("receivingEmphasis", () => {
  test("fills only the Mercado Pago button while it still asks to be linked", () => {
    const emphasis = receivingEmphasis({ mercadoPagoAsksToLink: true, protectionRequired: false });

    expect(emphasis).toEqual({ mercadoPago: "default", asaas: "outline" });
  });

  test("fills only the Asaas button while the new-supplier rule requires it", () => {
    const emphasis = receivingEmphasis({ mercadoPagoAsksToLink: true, protectionRequired: true });

    expect(emphasis).toEqual({ mercadoPago: "outline", asaas: "default" });
  });

  test("fills the Asaas button once Mercado Pago is linked", () => {
    const emphasis = receivingEmphasis({ mercadoPagoAsksToLink: false, protectionRequired: false });

    expect(emphasis.asaas).toBe("default");
  });
});
