import { describe, expect, it } from "vitest";
import { nextResellerInvoiceCheckAt, onBehalfLabelRefusal } from "./reseller-invoice.ts";

const NOW = new Date("2026-11-19T12:00:00Z");

function minutesAfterNow(date: Date): number {
  return (date.getTime() - NOW.getTime()) / 60_000;
}

describe("nextResellerInvoiceCheckAt", () => {
  it("reads again in 5 minutes after the first read, doubling after each one", () => {
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(1, NOW))).toBe(5);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(2, NOW))).toBe(10);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(4, NOW))).toBe(40);
  });

  it("waits at most an hour between reads", () => {
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(5, NOW))).toBe(60);
    expect(minutesAfterNow(nextResellerInvoiceCheckAt(500, NOW))).toBe(60);
  });

  it("throws for a count that is not a positive integer", () => {
    for (const checks of [0, -1, 1.5, Number.NaN]) {
      expect(() => nextResellerInvoiceCheckAt(checks, NOW)).toThrow(RangeError);
    }
  });
});

describe("onBehalfLabelRefusal", () => {
  const IDS = { shipmentId: "parcel-a", orderId: "order-a" } as const;
  const ready = {
    ...IDS,
    resellerNoteSource: "marketplace",
    remessaAuthorized: true,
    labelReleased: false,
  } as const;

  it("lets the label out once every note is in place", () => {
    expect(onBehalfLabelRefusal([ready], "mercado_livre")).toBeNull();
  });

  it("lets a direct-note order out: it has no venda à ordem parcel", () => {
    expect(onBehalfLabelRefusal([], "mercado_livre")).toBeNull();
  });

  it("waits for the reseller's note", () => {
    const refusal = onBehalfLabelRefusal(
      [{ ...IDS, resellerNoteSource: null, remessaAuthorized: false, labelReleased: false }],
      "tiktok_shop",
    );

    expect(refusal).toMatch(/espera a nota de venda do revendedor/);
  });

  it("asks for the XML when Mercado Livre only got a typed key", () => {
    const refusal = onBehalfLabelRefusal(
      [{ ...IDS, resellerNoteSource: "typed", remessaAuthorized: true, labelReleased: false }],
      "mercado_livre",
    );

    expect(refusal).toMatch(/envia o XML/);
  });

  it("takes a typed key on a marketplace that does not ask for the note", () => {
    expect(
      onBehalfLabelRefusal(
        [{ ...IDS, resellerNoteSource: "typed", remessaAuthorized: true, labelReleased: false }],
        "tiktok_shop",
      ),
    ).toBeNull();
  });

  it("lets the label out once the team released the stuck parcel", () => {
    const stuck = { ...IDS, resellerNoteSource: "uploaded", remessaAuthorized: false } as const;

    expect(onBehalfLabelRefusal([{ ...stuck, labelReleased: true }], "mercado_livre")).toBeNull();
    expect(onBehalfLabelRefusal([{ ...stuck, labelReleased: false }], "mercado_livre")).toMatch(
      /fale com o suporte do SellBridge/,
    );
  });

  it("keeps holding the label for another parcel of the cart that was not released", () => {
    const refusal = onBehalfLabelRefusal(
      [
        { ...IDS, resellerNoteSource: null, remessaAuthorized: false, labelReleased: true },
        { ...IDS, resellerNoteSource: "uploaded", remessaAuthorized: false, labelReleased: false },
      ],
      "mercado_livre",
    );

    expect(refusal).toMatch(/nota de remessa do fornecedor/);
  });

  it("says the hold comes from another order of the cart when this one is ready", () => {
    const refusal = onBehalfLabelRefusal(
      [
        { ...IDS, resellerNoteSource: "uploaded", remessaAuthorized: false, labelReleased: true },
        {
          shipmentId: "parcel-b",
          orderId: "order-b",
          resellerNoteSource: "uploaded",
          remessaAuthorized: false,
          labelReleased: false,
        },
      ],
      "mercado_livre",
      "order-a",
    );

    expect(refusal).toMatch(
      /^Este pedido está pronto, mas a etiqueta do Mercado Livre é a mesma do carrinho/,
    );
    expect(refusal).toMatch(/nota de remessa do fornecedor/);
  });

  it("keeps the plain reason when this order itself still waits", () => {
    const refusal = onBehalfLabelRefusal(
      [{ ...IDS, resellerNoteSource: null, remessaAuthorized: false, labelReleased: false }],
      "mercado_livre",
      "order-a",
    );

    expect(refusal).toMatch(/^A etiqueta desta venda à ordem espera a nota de venda do revendedor/);
  });

  it("waits for the remessa that goes in the box", () => {
    const refusal = onBehalfLabelRefusal(
      [{ ...IDS, resellerNoteSource: "uploaded", remessaAuthorized: false, labelReleased: false }],
      "mercado_livre",
    );

    expect(refusal).toMatch(/nota de remessa do fornecedor/);
  });
});
