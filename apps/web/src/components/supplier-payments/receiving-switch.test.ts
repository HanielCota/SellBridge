import { describe, expect, test } from "vitest";
import { switchTarget } from "./receiving-switch";

const BOTH_USABLE = { mercadoPagoUsable: true, asaasUsable: true, protectionRequired: false };

describe("switchTarget", () => {
  test("offers Asaas to a supplier receiving through Mercado Pago", () => {
    expect(switchTarget({ ...BOTH_USABLE, current: "mercado_pago" })).toBe("asaas");
  });

  test("offers Mercado Pago back to a supplier receiving through Asaas", () => {
    expect(switchTarget({ ...BOTH_USABLE, current: "asaas" })).toBe("mercado_pago");
  });

  test("offers nothing while the new-supplier rule keeps the supplier on Asaas", () => {
    const target = switchTarget({ ...BOTH_USABLE, current: "asaas", protectionRequired: true });

    expect(target).toBeNull();
  });

  test("offers nothing when the other account cannot receive", () => {
    const target = switchTarget({ ...BOTH_USABLE, current: "mercado_pago", asaasUsable: false });

    expect(target).toBeNull();
  });
});
