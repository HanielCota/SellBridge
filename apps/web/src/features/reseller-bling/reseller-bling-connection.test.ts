import { defaultResellerBlingSettings } from "@sellbridge/shared/reseller-bling";
import { describe, expect, it } from "vitest";
import {
  resellerBlingOutcomeSearch,
  resellerBlingSaveRefusal,
  resellerBlingSaveSchema,
} from "./reseller-bling-connection";

const CHOICES = { operationIds: [501, 503], paymentMethodIds: [10, 12] };

function save(input: { issueFromErp: boolean; operationId: number | null; pix?: number }) {
  return resellerBlingSaveSchema.parse({
    issueFromErp: input.issueFromErp,
    settings: {
      ...defaultResellerBlingSettings(),
      operationId: input.operationId,
      paymentMethods: input.pix === undefined ? {} : { pix: input.pix },
    },
  });
}

describe("resellerBlingSaveRefusal", () => {
  it("accepts an operation and payment methods the Bling has", () => {
    expect(
      resellerBlingSaveRefusal(save({ issueFromErp: true, operationId: 503, pix: 10 }), CHOICES),
    ).toBeNull();
  });

  it("asks for the sale operation before issuing by Bling", () => {
    expect(resellerBlingSaveRefusal(save({ issueFromErp: true, operationId: null }), CHOICES)).toBe(
      "Escolha a natureza de operação da venda para emitir pelo Bling.",
    );
  });

  it("lets the reseller keep sending the XML without an operation", () => {
    expect(
      resellerBlingSaveRefusal(save({ issueFromErp: false, operationId: null }), CHOICES),
    ).toBeNull();
  });

  it("refuses an operation the Bling does not have active", () => {
    expect(
      resellerBlingSaveRefusal(save({ issueFromErp: true, operationId: 999 }), CHOICES),
    ).toMatch(/não está ativa no seu Bling/);
  });

  it("refuses a payment method the Bling does not have", () => {
    expect(
      resellerBlingSaveRefusal(save({ issueFromErp: true, operationId: 503, pix: 77 }), CHOICES),
    ).toMatch(/formas de pagamento escolhidas não está ativa/);
  });
});

describe("resellerBlingOutcomeSearch", () => {
  it("keeps a known outcome only", () => {
    expect(resellerBlingOutcomeSearch({ bling: "conectado" })).toEqual({ bling: "conectado" });
    expect(resellerBlingOutcomeSearch({ bling: "<b>x</b>" })).toEqual({});
  });
});
